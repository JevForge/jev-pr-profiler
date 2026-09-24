import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProfilerDecision } from '../schemas/profiler.js';
import type { PrEvidence } from '../schemas/profiler.js';
import { buildCommentMarkdown } from './comment.js';

export function maybeWriteReports(
  enabled: boolean,
  dryRun: boolean,
  workspace: string,
  decision: ProfilerDecision,
  evidence: PrEvidence,
): { markdown: string | null; json: string | null } {
  if (!enabled) return { markdown: null, json: null };
  if (dryRun) {
    return {
      markdown: '.jev/pr-profiler-report.md',
      json: '.jev/pr-profiler-report.json',
    };
  }

  const dir = resolve(workspace, '.jev');
  mkdirSync(dir, { recursive: true });
  const markdownPath = resolve(dir, 'pr-profiler-report.md');
  const jsonPath = resolve(dir, 'pr-profiler-report.json');
  writeFileSync(markdownPath, buildCommentMarkdown(decision), 'utf8');
  writeFileSync(
    jsonPath,
    JSON.stringify({ decision, evidence_summary: {
      file_count: evidence.diff.file_count,
      additions: evidence.diff.additions,
      deletions: evidence.diff.deletions,
      labels: evidence.metadata.labels,
      security_total: evidence.security?.total ?? null,
      coverage_delta: evidence.coverage?.delta_lines_pct ?? null,
      incidents: evidence.incidents?.recent_count ?? null,
    }}, null, 2),
    'utf8',
  );
  return {
    markdown: '.jev/pr-profiler-report.md',
    json: '.jev/pr-profiler-report.json',
  };
}
