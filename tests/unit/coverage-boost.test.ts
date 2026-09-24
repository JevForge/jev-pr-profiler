import { describe, expect, it } from 'vitest';
import {
  loadJeConfig,
  coalesceProvider,
  coalescePolicy,
} from '../../src/collectors/config.js';
import { collectPrFromPayload, buildEvidence } from '../../src/collectors/evidence.js';
import { emptyDiffSignals } from '../../src/collectors/diff-signals.js';
import { sanitizeText, parseBoolean, parseStringList } from '../../src/utils/sanitize.js';
import { applyPolicyToAction } from '../../src/github/outputs.js';
import { ProfilerDecisionSchema } from '../../src/schemas/profiler.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const tmp = resolve('tests/fixtures/tmp-config');

describe('config + evidence + outputs', () => {
  it('loads .jev/config.yml and coalesces provider/policy', () => {
    mkdirSync(resolve(tmp, '.jev'), { recursive: true });
    writeFileSync(
      resolve(tmp, '.jev/config.yml'),
      'jev_provider: typesafe-native\nlow_confidence_policy: warn\nmin_confidence: 0.8\n',
    );
    const config = loadJeConfig(tmp);
    expect(config.jev_provider).toBe('typesafe-native');
    expect(coalesceProvider(undefined, config)).toBe('typesafe-native');
    expect(coalescePolicy(undefined, config)).toBe('warn');
    expect(coalesceProvider('custom-compatible', config)).toBe('custom-compatible');
    expect(() => coalesceProvider('nope')).toThrow(/Unsupported/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('collects PR metadata from payload and sanitizes text', () => {
    const collected = collectPrFromPayload({
      pull_request: {
        number: 12,
        title: 'Fix auth ghp_abcdefghijklmnopqrstuvwxyz012345',
        body: 'details',
        user: { login: 'dev' },
        labels: [{ name: 'bug' }],
        draft: false,
        base: { ref: 'main' },
        head: { ref: 'fix' },
        requested_reviewers: [{ login: 'r1' }],
        commits: 2,
        html_url: 'https://example.test/pr/12',
      },
    });
    expect(collected.metadata.number).toBe(12);
    expect(collected.metadata.title).toContain('[REDACTED]');
    expect(collected.metadata.labels).toEqual(['bug']);
    expect(buildEvidence({ metadata: collected.metadata }).diff.file_count).toBe(0);
    expect(sanitizeText('Bearer abcdefghijklmnopqrstuvwxyz012345')).toContain('[REDACTED]');
    expect(parseBoolean('true', false)).toBe(true);
    expect(parseStringList('a, b\nc')).toEqual(['a', 'b', 'c']);
    expect(emptyDiffSignals().file_count).toBe(0);
  });

  it('writes action outputs and fails on policy fail', () => {
    const outputs: Record<string, string> = {};
    let failed: string | null = null;
    const decision = ProfilerDecisionSchema.parse({
      decision: 'PROFILE',
      risk_level: 'LOW',
      review_depth: 'LIGHT',
      recommended_checks: ['unit_tests'],
      confidence: 0.9,
      reason_codes: ['LOW_COMPLEXITY'],
      explanation: 'ok',
      provisional: false,
      jev_status: 'evaluated',
      policy_floor_risk: 'LOW',
    });
    applyPolicyToAction(
      {
        setOutput: (k, v) => {
          outputs[k] = v;
        },
        setFailed: m => {
          failed = m;
        },
        warning: () => undefined,
        info: () => undefined,
      },
      { status: 'fail', decision, message: 'boom' },
      'summary',
      {
        fileCount: 1,
        additions: 2,
        deletions: 3,
        commentStatus: 'skipped',
        labelStatus: 'skipped',
        checkStatus: 'skipped',
        reviewersStatus: 'skipped',
        reportMarkdown: null,
        reportJson: null,
      },
    );
    expect(outputs.decision).toBe('PROFILE');
    expect(outputs.risk_level).toBe('LOW');
    expect(failed).toBe('boom');
  });
});
