import type { ProfilerDecision } from '../schemas/profiler.js';

export const COMMENT_MARKER = '<!-- jev-pr-profiler -->';

export function buildCommentMarkdown(decision: ProfilerDecision): string {
  const lines = [
    COMMENT_MARKER,
    '### JEV Pull Request Profiler',
    '',
    `- **Decision:** \`${decision.decision}\``,
    `- **Risk level:** \`${decision.risk_level ?? 'n/a'}\``,
    `- **Review depth:** \`${decision.review_depth ?? 'n/a'}\``,
    `- **Recommended checks:** ${
      decision.recommended_checks.map(c => `\`${c}\``).join(', ') || '`none`'
    }`,
    `- **Confidence:** ${decision.confidence.toFixed(3)}`,
    `- **Reason codes:** ${decision.reason_codes.map(c => `\`${c}\``).join(', ')}`,
    `- **Provisional:** ${decision.provisional ? 'yes' : 'no'}`,
    `- **Jev status:** \`${decision.jev_status}\``,
    `- **Policy floor risk:** \`${decision.policy_floor_risk ?? 'n/a'}\``,
  ];
  if (decision.explanation) {
    lines.push('', decision.explanation);
  }
  lines.push(
    '',
    '_This Action profiles risk and recommends checks. It never approves or merges the PR._',
  );
  return lines.join('\n');
}

export interface CommentClient {
  listComments(): Promise<Array<{ id: number; body?: string | null }>>;
  createComment(body: string): Promise<void>;
  updateComment(id: number, body: string): Promise<void>;
}

export async function maybePostComment(
  enabled: boolean,
  dryRun: boolean,
  decision: ProfilerDecision,
  client: CommentClient | null,
): Promise<'posted' | 'updated' | 'dry-run' | 'skipped'> {
  if (!enabled) return 'skipped';
  const body = buildCommentMarkdown(decision);
  if (dryRun || !client) return 'dry-run';

  const existing = (await client.listComments()).find(c =>
    (c.body ?? '').includes(COMMENT_MARKER),
  );
  if (existing) {
    await client.updateComment(existing.id, body);
    return 'updated';
  }
  await client.createComment(body);
  return 'posted';
}
