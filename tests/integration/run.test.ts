import { describe, expect, it, vi } from 'vitest';
import { createJevProvider } from '../../src/jev/factory.js';
import { runProfiler } from '../../src/run.js';
import { buildEvidence } from '../../src/collectors/evidence.js';
import { summarizeDiffFiles } from '../../src/collectors/diff-signals.js';
import { PrMetadataSchema } from '../../src/schemas/profiler.js';
import { matchBaseline, parseBaselineConfig } from '../../src/collectors/baseline.js';

const evidence = buildEvidence({
  metadata: PrMetadataSchema.parse({
    number: 42,
    title: 'Harden auth',
    body_excerpt: 'rotate session cookies',
    author: 'carol',
    labels: [],
    draft: false,
    base_ref: 'main',
    head_ref: 'sec',
    changed_requested_reviewers: 0,
    commits: 3,
  }),
  diff: summarizeDiffFiles([
    { filename: 'src/auth/session.ts', status: 'modified', additions: 80, deletions: 20 },
  ]),
});

describe('Jev providers + runProfiler', () => {
  it('does not silently fall back between providers', () => {
    expect(() =>
      createJevProvider({
        provider: 'not-real' as 'vercel-ai-gateway',
        timeoutMs: 1000,
      }),
    ).toThrow(/Unsupported jev_provider/);
  });

  it('uses custom-compatible evaluate contract', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        answers: {
          risk_level: { type: 'choice', choice: 'HIGH', confidence: 0.91 },
          review_depth: { type: 'choice', choice: 'EXPERT' },
          recommended_check_primary: { type: 'choice', choice: 'security_scan' },
          recommended_check_secondary: { type: 'choice', choice: 'secrets_scan' },
          recommended_check_tertiary: { type: 'choice', choice: 'unit_tests' },
          abstain: { type: 'boolean', probability: 0.1 },
          request_review: { type: 'boolean', probability: 0.1 },
        },
        confidence: { risk_level: 0.91 },
      }),
    })) as unknown as typeof fetch;

    const result = await runProfiler({
      evidence,
      min_confidence: 0.7,
      low_confidence_policy: 'fail',
      jev_provider: 'custom-compatible',
      jev_endpoint: 'https://example.test/evaluate',
      jev_model: 'typesafe-ai/jev',
      timeout_ms: 5_000,
      comment_on_github: false,
      apply_labels: false,
      create_check_run: false,
      write_report_artifact: false,
      dry_run: true,
      request_reviewers: [],
      workspace: process.cwd(),
      apiKey: 'test-key',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.outcome.status).toBe('ok');
    expect(result.decision.risk_level).toBe('HIGH');
    expect(result.decision.review_depth).toBe('EXPERT');
    expect(result.decision.recommended_checks).toEqual(
      expect.arrayContaining(['security_scan', 'secrets_scan', 'unit_tests']),
    );
  });

  it('applies deterministic floor when provider is unavailable', async () => {
    const result = await runProfiler({
      evidence,
      min_confidence: 0.7,
      low_confidence_policy: 'request-review',
      jev_provider: 'vercel-ai-gateway',
      timeout_ms: 1_000,
      comment_on_github: true,
      apply_labels: true,
      create_check_run: true,
      write_report_artifact: true,
      dry_run: true,
      request_reviewers: ['alice', 'team:security'],
      workspace: process.cwd(),
      head_sha: 'abc123',
      // missing apiKey → unavailable
    });

    expect(result.outcome.status).toBe('request-review');
    expect(result.decision.provisional).toBe(true);
    expect(result.decision.risk_level).toBe('HIGH');
    expect(result.commentStatus).toBe('dry-run');
    expect(result.labelStatus).toBe('dry-run');
    expect(result.checkStatus).toBe('dry-run');
    expect(result.reviewersStatus).toBe('dry-run');
  });

  it('rejects schema-invalid custom responses', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        answers: {
          risk_level: { type: 'choice', choice: 'YEET' },
          review_depth: { type: 'choice', choice: 'STANDARD' },
        },
      }),
    })) as unknown as typeof fetch;

    const result = await runProfiler({
      evidence,
      min_confidence: 0.7,
      low_confidence_policy: 'warn',
      jev_provider: 'custom-compatible',
      jev_endpoint: 'https://example.test/evaluate',
      jev_model: 'jev',
      timeout_ms: 5_000,
      comment_on_github: false,
      apply_labels: false,
      create_check_run: false,
      write_report_artifact: false,
      dry_run: true,
      request_reviewers: [],
      workspace: process.cwd(),
      apiKey: 'x',
      fetchImpl,
    });

    expect(result.decision.jev_status).toBe('schema_rejected');
    expect(result.decision.provisional).toBe(true);
  });

  it('skips the provider for a deterministic baseline rule', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('provider must not be called');
    }) as unknown as typeof fetch;
    const baseline = matchBaseline(parseBaselineConfig({
      version: 1,
      floors: [],
      overrides: [{ paths: ['src/auth/**'], risk: 'HIGH', review_depth: 'EXPERT', skip_jev: true }],
    }), ['src/auth/session.ts']);
    const result = await runProfiler({
      evidence,
      min_confidence: 0.7,
      low_confidence_policy: 'fail',
      jev_provider: 'custom-compatible',
      jev_endpoint: 'https://example.test/evaluate',
      jev_model: 'jev',
      timeout_ms: 5_000,
      comment_on_github: false,
      apply_labels: false,
      create_check_run: false,
      write_report_artifact: false,
      dry_run: true,
      request_reviewers: [],
      workspace: process.cwd(),
      fetchImpl,
      baseline,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.decision.jev_status).toBe('skipped');
    expect(result.decision.reason_codes).toContain('JEV_SKIPPED_BY_BASELINE');
  });

  it('fails the configured risk gate after keeping the profile outputs', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        answers: {
          risk_level: { type: 'choice', choice: 'HIGH', confidence: 0.95 },
          review_depth: { type: 'choice', choice: 'THOROUGH' },
          recommended_check_primary: { type: 'choice', choice: 'unit_tests' },
        },
        confidence: { risk_level: 0.95 },
      }),
    })) as unknown as typeof fetch;
    const result = await runProfiler({
      evidence,
      min_confidence: 0.7,
      low_confidence_policy: 'fail',
      jev_provider: 'custom-compatible',
      jev_endpoint: 'https://example.test/evaluate',
      jev_model: 'jev',
      timeout_ms: 5_000,
      fail_on_risk: 'HIGH',
      comment_on_github: false,
      apply_labels: false,
      create_check_run: false,
      write_report_artifact: false,
      dry_run: true,
      request_reviewers: [],
      workspace: process.cwd(),
      fetchImpl,
    });
    expect(result.outcome.status).toBe('fail');
    expect(result.decision.reason_codes).toContain('FAIL_ON_RISK');
    expect(result.decision.review_checklist.length).toBeGreaterThan(0);
  });
});
