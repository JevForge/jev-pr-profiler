export const DECISIONS = ['PROFILE', 'ABSTAIN', 'REQUEST_REVIEW'] as const;
export type Decision = (typeof DECISIONS)[number];

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const REVIEW_DEPTHS = ['LIGHT', 'STANDARD', 'THOROUGH', 'EXPERT'] as const;
export type ReviewDepth = (typeof REVIEW_DEPTHS)[number];

export const DIFF_AREAS = ['auth', 'api', 'infra', 'ui'] as const;
export type DiffArea = (typeof DIFF_AREAS)[number];

export const RECOMMENDED_CHECKS = [
  'unit_tests',
  'integration_tests',
  'e2e_tests',
  'security_scan',
  'secrets_scan',
  'dependency_scan',
  'iac_scan',
  'performance_tests',
  'load_tests',
  'chaos_tests',
  'migration_review',
  'architecture_review',
  'codeowners_review',
  'docs_review',
  'accessibility_review',
  'privacy_review',
] as const;
export type RecommendedCheck = (typeof RECOMMENDED_CHECKS)[number];

export const REASON_CODES = [
  'SMALL_DIFF',
  'LARGE_DIFF',
  'MANY_FILES',
  'SENSITIVE_PATHS',
  'AUTH_SECURITY_TOUCH',
  'INFRA_TOUCH',
  'DOCS_ONLY',
  'TESTS_INCLUDED',
  'TESTS_MISSING',
  'HIGH_COMPLEXITY',
  'LOW_COMPLEXITY',
  'SECURITY_FINDINGS',
  'COVERAGE_DROP',
  'INCIDENT_HISTORY',
  'LABELS_HOTFIX',
  'LABELS_BREAKING',
  'NEW_CONTRIBUTOR',
  'CROSS_AREA',
  'LOW_CONFIDENCE',
  'JEV_UNAVAILABLE',
  'SCHEMA_REJECTED',
  'POLICY_ABSTAIN',
  'POLICY_REQUEST_REVIEW',
  'POLICY_FLOOR_RAISED',
  'FLOOR_AFTER_ABSTAIN',
  'BASELINE_FLOOR',
  'JEV_SKIPPED_BY_BASELINE',
  'FAIL_ON_RISK',
  'AREA_AUTH',
  'AREA_API',
  'AREA_INFRA',
  'AREA_UI',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const JEV_PROVIDERS = [
  'vercel-ai-gateway',
  'typesafe-native',
  'custom-compatible',
] as const;
export type JevProviderId = (typeof JEV_PROVIDERS)[number];

export const LOW_CONFIDENCE_POLICIES = [
  'fail',
  'warn',
  'request-review',
  'no-op',
] as const;
export type LowConfidencePolicy = (typeof LOW_CONFIDENCE_POLICIES)[number];

export const JEV_STATUSES = ['evaluated', 'unavailable', 'schema_rejected', 'skipped'] as const;
export type JevStatus = (typeof JEV_STATUSES)[number];

export const FAIL_ON_RISK_LEVELS = ['HIGH', 'CRITICAL'] as const;
export type FailOnRiskLevel = (typeof FAIL_ON_RISK_LEVELS)[number];

export const REVIEW_CHECKLIST_ITEMS = [
  'run_tests',
  'inspect_security_impact',
  'review_api_compatibility',
  'review_infrastructure_changes',
  'validate_migrations',
  'confirm_codeowners',
  'check_coverage_delta',
  'check_ui_accessibility',
  'review_docs_links',
  'validate_sentinel_findings',
] as const;
export type ReviewChecklistItem = (typeof REVIEW_CHECKLIST_ITEMS)[number];

export const RISK_RANK: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export const DEPTH_RANK: Record<ReviewDepth, number> = {
  LIGHT: 0,
  STANDARD: 1,
  THOROUGH: 2,
  EXPERT: 3,
};

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

export function maxDepth(a: ReviewDepth, b: ReviewDepth): ReviewDepth {
  return DEPTH_RANK[a] >= DEPTH_RANK[b] ? a : b;
}

export function defaultChecksForRisk(risk: RiskLevel): RecommendedCheck[] {
  switch (risk) {
    case 'LOW':
      return ['unit_tests', 'docs_review'];
    case 'MEDIUM':
      return ['unit_tests', 'integration_tests', 'codeowners_review'];
    case 'HIGH':
      return [
        'unit_tests',
        'integration_tests',
        'security_scan',
        'codeowners_review',
        'architecture_review',
      ];
    case 'CRITICAL':
      return [
        'unit_tests',
        'integration_tests',
        'e2e_tests',
        'security_scan',
        'secrets_scan',
        'dependency_scan',
        'codeowners_review',
        'architecture_review',
        'privacy_review',
      ];
  }
}
