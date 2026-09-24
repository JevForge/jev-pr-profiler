import type { ProfilerDecision } from '../schemas/profiler.js';
import type { PolicyOutcome } from '../decision/policy.js';

export interface ActionOutputWriter {
  setOutput(name: string, value: string): void;
  setFailed(message: string): void;
  warning(message: string): void;
  info(message: string): void;
}

export function writeDecisionOutputs(
  writer: ActionOutputWriter,
  decision: ProfilerDecision,
  summary: string,
  extras: {
    fileCount: number;
    additions: number;
    deletions: number;
    commentStatus: string;
    labelStatus: string;
    checkStatus: string;
    reviewersStatus: string;
    reportMarkdown: string | null;
    reportJson: string | null;
    suggestedReviewers: string[];
  },
): void {
  writer.setOutput('decision', decision.decision);
  writer.setOutput('risk_level', decision.risk_level ?? '');
  writer.setOutput('review_depth', decision.review_depth ?? '');
  writer.setOutput('recommended_checks', JSON.stringify(decision.recommended_checks));
  writer.setOutput('review_checklist', JSON.stringify(decision.review_checklist));
  writer.setOutput('confidence', String(decision.confidence));
  writer.setOutput('reason_codes', JSON.stringify(decision.reason_codes));
  writer.setOutput('explanation', decision.explanation);
  writer.setOutput('provisional', String(decision.provisional));
  writer.setOutput('jev_status', decision.jev_status);
  writer.setOutput('policy_floor_risk', decision.policy_floor_risk ?? '');
  writer.setOutput('summary', summary);
  writer.setOutput('file_count', String(extras.fileCount));
  writer.setOutput('additions', String(extras.additions));
  writer.setOutput('deletions', String(extras.deletions));
  writer.setOutput('comment_status', extras.commentStatus);
  writer.setOutput('label_status', extras.labelStatus);
  writer.setOutput('check_status', extras.checkStatus);
  writer.setOutput('reviewers_status', extras.reviewersStatus);
  writer.setOutput('report_markdown_file', extras.reportMarkdown ?? '');
  writer.setOutput('report_json_file', extras.reportJson ?? '');
  writer.setOutput('suggested_reviewers', JSON.stringify(extras.suggestedReviewers));
}

export function applyPolicyToAction(
  writer: ActionOutputWriter,
  outcome: PolicyOutcome,
  summary: string,
  extras: Parameters<typeof writeDecisionOutputs>[3],
): void {
  writeDecisionOutputs(writer, outcome.decision, summary, extras);
  if (outcome.status === 'fail') {
    writer.setFailed(outcome.message);
    return;
  }
  if (outcome.status === 'warn') {
    writer.warning(outcome.message);
  }
  if (outcome.status === 'request-review') {
    writer.warning('PR profile requires human review');
  }
  if (outcome.status === 'no-op') {
    writer.info(outcome.message);
  }
}
