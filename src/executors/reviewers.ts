import type { ProfilerDecision } from '../schemas/profiler.js';
import { RISK_RANK } from '../schemas/enums.js';

export interface ReviewerClient {
  requestReviewers(input: {
    users: string[];
    teams: string[];
  }): Promise<void>;
}

function parseReviewers(raw: string[]): { users: string[]; teams: string[] } {
  const users: string[] = [];
  const teams: string[] = [];
  for (const item of raw) {
    const value = item.trim();
    if (!value) continue;
    if (value.startsWith('team:')) {
      teams.push(value.slice('team:'.length));
    } else if (value.replace(/^@/, '').includes('/')) {
      teams.push(value.replace(/^@/, '').split('/').pop()!);
    } else {
      users.push(value.replace(/^@/, ''));
    }
  }
  return { users: [...new Set(users)], teams: [...new Set(teams)] };
}

/**
 * Request reviewers only for HIGH/CRITICAL or EXPERT profiles.
 * Never merges, approves, or dismisses reviews.
 */
export async function maybeRequestReviewers(
  reviewers: string[],
  dryRun: boolean,
  decision: ProfilerDecision,
  client: ReviewerClient | null,
): Promise<'requested' | 'dry-run' | 'skipped'> {
  if (!reviewers.length) return 'skipped';
  const risk = decision.risk_level;
  const expert = decision.review_depth === 'EXPERT';
  const high =
    risk != null && RISK_RANK[risk] >= RISK_RANK.HIGH;
  if (!high && !expert) return 'skipped';

  const parsed = parseReviewers(reviewers);
  if (!parsed.users.length && !parsed.teams.length) return 'skipped';
  if (dryRun || !client) return 'dry-run';

  await client.requestReviewers(parsed);
  return 'requested';
}
