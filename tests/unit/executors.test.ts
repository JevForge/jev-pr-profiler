import { describe, expect, it, vi } from 'vitest';
import {
  buildCommentMarkdown,
  maybePostComment,
  COMMENT_MARKER,
} from '../../src/executors/comment.js';
import {
  applyProfilerLabels,
  desiredLabels,
  maybeCreateCheckRun,
} from '../../src/executors/github-status.js';
import { maybeRequestReviewers } from '../../src/executors/reviewers.js';
import { ProfilerDecisionSchema } from '../../src/schemas/profiler.js';
import type { PolicyOutcome } from '../../src/decision/policy.js';

const decision = ProfilerDecisionSchema.parse({
  decision: 'PROFILE',
  risk_level: 'HIGH',
  review_depth: 'EXPERT',
  recommended_checks: ['security_scan', 'unit_tests'],
  confidence: 0.93,
  reason_codes: ['AUTH_SECURITY_TOUCH'],
  explanation: 'auth touch',
  provisional: false,
  jev_status: 'evaluated',
  policy_floor_risk: 'HIGH',
});

describe('executors', () => {
  it('builds a comment with marker and updates existing ones', async () => {
    expect(buildCommentMarkdown(decision)).toContain(COMMENT_MARKER);
    const updateComment = vi.fn(async () => undefined);
    const createComment = vi.fn(async () => undefined);
    const status = await maybePostComment(true, false, decision, {
      listComments: async () => [{ id: 9, body: `${COMMENT_MARKER}\nold` }],
      createComment,
      updateComment,
    });
    expect(status).toBe('updated');
    expect(updateComment).toHaveBeenCalledOnce();
    expect(createComment).not.toHaveBeenCalled();
  });

  it('applies managed labels only', async () => {
    expect(desiredLabels(decision)).toEqual([
      'jev:risk:HIGH',
      'jev:review-depth:EXPERT',
    ]);
    const setLabels = vi.fn(async () => undefined);
    const ensureLabel = vi.fn(async () => undefined);
    const status = await applyProfilerLabels(true, false, decision, {
      listLabels: async () => ['bug', 'jev:risk:LOW'],
      ensureLabel,
      setLabels,
    });
    expect(status).toBe('applied');
    expect(setLabels).toHaveBeenCalledWith([
      'bug',
      'jev:risk:HIGH',
      'jev:review-depth:EXPERT',
    ]);
  });

  it('creates check runs and requests reviewers for high risk', async () => {
    const outcome: PolicyOutcome = { status: 'ok', decision };
    const createCheckRun = vi.fn(async () => undefined);
    const updateCheckRun = vi.fn(async () => undefined);
    const findCheckRun = vi.fn(async () => null);
    const check = await maybeCreateCheckRun(true, false, 'sha', outcome, {
      findCheckRun,
      createCheckRun,
      updateCheckRun,
    });
    expect(check).toBe('created');
    expect(createCheckRun).toHaveBeenCalledOnce();

    findCheckRun.mockResolvedValueOnce({ id: 99 });
    const updated = await maybeCreateCheckRun(true, false, 'sha', outcome, {
      findCheckRun,
      createCheckRun,
      updateCheckRun,
    });
    expect(updated).toBe('updated');
    expect(updateCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ checkRunId: 99 }),
    );

    const requestReviewers = vi.fn(async () => undefined);
    const reviewers = await maybeRequestReviewers(
      ['alice', 'team:security'],
      false,
      decision,
      { requestReviewers },
    );
    expect(reviewers).toBe('requested');
    expect(requestReviewers).toHaveBeenCalledWith({
      users: ['alice'],
      teams: ['security'],
    });

    const codeownersRequest = vi.fn(async () => undefined);
    await maybeRequestReviewers(
      ['@alice', '@org/security'],
      false,
      decision,
      { requestReviewers: codeownersRequest },
    );
    expect(codeownersRequest).toHaveBeenCalledWith({
      users: ['alice'],
      teams: ['security'],
    });
  });
});
