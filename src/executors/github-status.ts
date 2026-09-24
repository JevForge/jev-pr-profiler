import type { ProfilerDecision } from '../schemas/profiler.js';
import type { PolicyOutcome } from '../decision/policy.js';

export const RISK_LABEL_PREFIX = 'jev:risk:';
export const DEPTH_LABEL_PREFIX = 'jev:review-depth:';
export const REVIEW_LABEL = 'jev:review';
export const CHECK_RUN_NAME = 'JEV Pull Request Profiler';
export const CHECK_RUN_EXTERNAL_ID = 'jev-pr-profiler';

export function desiredLabels(decision: ProfilerDecision): string[] {
  const labels: string[] = [];
  if (decision.risk_level) labels.push(`${RISK_LABEL_PREFIX}${decision.risk_level}`);
  if (decision.review_depth) labels.push(`${DEPTH_LABEL_PREFIX}${decision.review_depth}`);
  if (decision.decision === 'REQUEST_REVIEW') labels.push(REVIEW_LABEL);
  return labels;
}

export function isManagedLabel(name: string): boolean {
  return (
    name.startsWith(RISK_LABEL_PREFIX) ||
    name.startsWith(DEPTH_LABEL_PREFIX) ||
    name === REVIEW_LABEL
  );
}

export interface LabelClient {
  listLabels(): Promise<string[]>;
  ensureLabel(name: string): Promise<void>;
  setLabels(next: string[]): Promise<void>;
}

export async function applyProfilerLabels(
  enabled: boolean,
  dryRun: boolean,
  decision: ProfilerDecision,
  client: LabelClient | null,
): Promise<'applied' | 'dry-run' | 'skipped'> {
  if (!enabled) return 'skipped';
  if (dryRun || !client) return 'dry-run';

  const current = await client.listLabels();
  const preserved = current.filter(name => !isManagedLabel(name));
  const next = [...new Set([...preserved, ...desiredLabels(decision)])];

  for (const name of desiredLabels(decision)) {
    await client.ensureLabel(name);
  }
  await client.setLabels(next);
  return 'applied';
}

export function checkConclusion(
  outcome: PolicyOutcome,
): 'success' | 'neutral' | 'failure' {
  if (outcome.status === 'ok') return 'success';
  if (outcome.status === 'fail') return 'failure';
  return 'neutral';
}

export function buildCheckSummary(outcome: PolicyOutcome): string {
  const d = outcome.decision;
  return [
    '### JEV Pull Request Profiler',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Decision | \`${d.decision}\` |`,
    `| Risk | \`${d.risk_level ?? 'n/a'}\` |`,
    `| Review depth | \`${d.review_depth ?? 'n/a'}\` |`,
    `| Checks | ${d.recommended_checks.map(c => `\`${c}\``).join(', ') || '`none`'} |`,
    `| Confidence | ${d.confidence.toFixed(3)} |`,
    `| Policy | \`${outcome.status}\` |`,
    `| Reason codes | ${d.reason_codes.map(c => `\`${c}\``).join(', ')} |`,
    '',
    d.explanation || '_No explanation._',
  ].join('\n');
}

export interface CheckRunClient {
  findCheckRun(input: {
    headSha: string;
    name: string;
  }): Promise<{ id: number } | null>;
  createCheckRun(input: {
    name: string;
    headSha: string;
    conclusion: 'success' | 'neutral' | 'failure';
    title: string;
    summary: string;
    externalId?: string;
  }): Promise<void>;
  updateCheckRun(input: {
    checkRunId: number;
    conclusion: 'success' | 'neutral' | 'failure';
    title: string;
    summary: string;
  }): Promise<void>;
}

export async function maybeCreateCheckRun(
  enabled: boolean,
  dryRun: boolean,
  headSha: string | null,
  outcome: PolicyOutcome,
  client: CheckRunClient | null,
): Promise<'created' | 'updated' | 'dry-run' | 'skipped'> {
  if (!enabled) return 'skipped';
  if (!headSha) return 'skipped';
  if (dryRun || !client) return 'dry-run';

  const title = outcome.decision.risk_level
    ? `${outcome.decision.decision}: ${outcome.decision.risk_level}`
    : outcome.decision.decision;
  const conclusion = checkConclusion(outcome);
  const summary = buildCheckSummary(outcome);

  const existing = await client.findCheckRun({ headSha, name: CHECK_RUN_NAME });
  if (existing) {
    await client.updateCheckRun({
      checkRunId: existing.id,
      conclusion,
      title,
      summary,
    });
    return 'updated';
  }

  await client.createCheckRun({
    name: CHECK_RUN_NAME,
    headSha,
    conclusion,
    title,
    summary,
    externalId: CHECK_RUN_EXTERNAL_ID,
  });
  return 'created';
}
