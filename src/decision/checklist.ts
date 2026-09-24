import {
  REVIEW_CHECKLIST_ITEMS,
  type ReviewChecklistItem,
} from '../schemas/enums.js';
import type { PrEvidence, ProfilerDecision } from '../schemas/profiler.js';

export const CHECKLIST_LABELS: Record<ReviewChecklistItem, string> = {
  run_tests: 'Run the relevant automated tests',
  inspect_security_impact: 'Inspect security and sensitive-data impact',
  review_api_compatibility: 'Review API compatibility and contract changes',
  review_infrastructure_changes: 'Review infrastructure and deployment changes',
  validate_migrations: 'Validate migration safety and rollback behavior',
  confirm_codeowners: 'Confirm CODEOWNERS/domain-owner review',
  check_coverage_delta: 'Check coverage delta and uncovered paths',
  check_ui_accessibility: 'Check UI accessibility and interaction states',
  review_docs_links: 'Review documentation links and examples',
  validate_sentinel_findings: 'Validate Sentinel findings and remediation scope',
};

function add(items: ReviewChecklistItem[], item: ReviewChecklistItem): void {
  if (!items.includes(item)) items.push(item);
}

export function buildReviewChecklist(
  evidence: PrEvidence,
  decision: ProfilerDecision,
): ReviewChecklistItem[] {
  const items: ReviewChecklistItem[] = [];
  const checks = new Set(decision.recommended_checks);
  const areas = new Set(evidence.diff.areas.map(area => area.area));
  add(items, 'run_tests');
  if (checks.has('security_scan') || evidence.diff.sensitive_paths.length > 0 || evidence.diff.touch_auth) {
    add(items, 'inspect_security_impact');
  }
  if (areas.has('api')) add(items, 'review_api_compatibility');
  if (evidence.diff.touch_infra) add(items, 'review_infrastructure_changes');
  if (evidence.diff.touch_migrations) add(items, 'validate_migrations');
  if (checks.has('codeowners_review') || evidence.diff.sensitive_paths.length > 0) add(items, 'confirm_codeowners');
  if (evidence.coverage?.delta_lines_pct != null) add(items, 'check_coverage_delta');
  if (areas.has('ui')) add(items, 'check_ui_accessibility');
  if (evidence.diff.touch_docs_only) add(items, 'review_docs_links');
  if (evidence.security) add(items, 'validate_sentinel_findings');
  return items.filter((item): item is ReviewChecklistItem =>
    (REVIEW_CHECKLIST_ITEMS as readonly string[]).includes(item),
  ).slice(0, 10);
}

export function renderReviewChecklist(items: ReviewChecklistItem[]): string[] {
  return items.map(item => `- [ ] ${CHECKLIST_LABELS[item]}`);
}
