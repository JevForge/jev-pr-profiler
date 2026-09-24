import {
  defaultChecksForRisk,
  maxDepth,
  maxRisk,
  type ReasonCode,
  type RecommendedCheck,
  type ReviewDepth,
  type RiskLevel,
} from '../schemas/enums.js';
import type { PrEvidence } from '../schemas/profiler.js';

export interface DeterministicFloor {
  risk: RiskLevel;
  review_depth: ReviewDepth;
  recommended_checks: RecommendedCheck[];
  reason_codes: ReasonCode[];
}

/**
 * Pure deterministic floor from evidence. Jev may raise severity, never lower below this floor.
 */
export function computeDeterministicFloor(evidence: PrEvidence): DeterministicFloor {
  let risk: RiskLevel = 'LOW';
  let depth: ReviewDepth = 'LIGHT';
  const reasons: ReasonCode[] = [];
  const checks = new Set<RecommendedCheck>();

  const { diff, metadata, security, coverage, incidents } = evidence;
  const churn = diff.additions + diff.deletions;
  const labels = metadata.labels.map(l => l.toLowerCase());

  if (diff.touch_docs_only && diff.file_count > 0) {
    reasons.push('DOCS_ONLY', 'LOW_COMPLEXITY');
    checks.add('docs_review');
  } else if (diff.file_count === 0 && churn === 0) {
    reasons.push('SMALL_DIFF', 'LOW_COMPLEXITY');
    checks.add('unit_tests');
  } else if (churn < 80 && diff.file_count <= 5) {
    reasons.push('SMALL_DIFF', 'LOW_COMPLEXITY');
    risk = maxRisk(risk, 'LOW');
    depth = maxDepth(depth, 'LIGHT');
    checks.add('unit_tests');
  } else if (churn < 400 && diff.file_count <= 20) {
    reasons.push('LOW_COMPLEXITY');
    risk = maxRisk(risk, 'MEDIUM');
    depth = maxDepth(depth, 'STANDARD');
    for (const c of defaultChecksForRisk('MEDIUM')) checks.add(c);
  } else if (churn < 1_500 && diff.file_count <= 50) {
    reasons.push('LARGE_DIFF', 'HIGH_COMPLEXITY');
    risk = maxRisk(risk, 'HIGH');
    depth = maxDepth(depth, 'THOROUGH');
    for (const c of defaultChecksForRisk('HIGH')) checks.add(c);
  } else {
    reasons.push('LARGE_DIFF', 'MANY_FILES', 'HIGH_COMPLEXITY');
    risk = maxRisk(risk, 'CRITICAL');
    depth = maxDepth(depth, 'EXPERT');
    for (const c of defaultChecksForRisk('CRITICAL')) checks.add(c);
  }

  if (diff.file_count >= 25) {
    reasons.push('MANY_FILES');
    risk = maxRisk(risk, 'HIGH');
    depth = maxDepth(depth, 'THOROUGH');
  }

  if (diff.sensitive_paths.length > 0) {
    reasons.push('SENSITIVE_PATHS');
    risk = maxRisk(risk, 'HIGH');
    depth = maxDepth(depth, 'THOROUGH');
    checks.add('security_scan');
    checks.add('secrets_scan');
    checks.add('codeowners_review');
  }

  if (diff.touch_auth) {
    reasons.push('AUTH_SECURITY_TOUCH');
    risk = maxRisk(risk, 'HIGH');
    depth = maxDepth(depth, 'EXPERT');
    checks.add('security_scan');
    checks.add('privacy_review');
  }

  if (diff.touch_infra) {
    reasons.push('INFRA_TOUCH');
    risk = maxRisk(risk, 'HIGH');
    depth = maxDepth(depth, 'THOROUGH');
    checks.add('iac_scan');
  }

  if (diff.touch_migrations) {
    checks.add('migration_review');
    risk = maxRisk(risk, 'HIGH');
    depth = maxDepth(depth, 'THOROUGH');
  }

  if (diff.touch_tests) {
    reasons.push('TESTS_INCLUDED');
  } else if (!diff.touch_docs_only && diff.file_count > 0) {
    reasons.push('TESTS_MISSING');
    checks.add('unit_tests');
    depth = maxDepth(depth, 'STANDARD');
  }

  if (labels.some(l => l.includes('breaking') || l.includes('major'))) {
    reasons.push('LABELS_BREAKING');
    risk = maxRisk(risk, 'HIGH');
    depth = maxDepth(depth, 'EXPERT');
    checks.add('architecture_review');
  }

  if (labels.some(l => l.includes('hotfix') || l.includes('urgent') || l.includes('sev'))) {
    reasons.push('LABELS_HOTFIX');
    risk = maxRisk(risk, 'HIGH');
    depth = maxDepth(depth, 'THOROUGH');
  }

  if (diff.languages.length >= 4) {
    reasons.push('CROSS_AREA');
    depth = maxDepth(depth, 'THOROUGH');
  }

  if (security && (security.critical > 0 || security.high > 0)) {
    reasons.push('SECURITY_FINDINGS');
    risk = maxRisk(risk, security.critical > 0 ? 'CRITICAL' : 'HIGH');
    depth = maxDepth(depth, security.critical > 0 ? 'EXPERT' : 'THOROUGH');
    checks.add('security_scan');
    checks.add('dependency_scan');
  }

  if (coverage && typeof coverage.delta_lines_pct === 'number' && coverage.delta_lines_pct <= -2) {
    reasons.push('COVERAGE_DROP');
    risk = maxRisk(risk, 'MEDIUM');
    depth = maxDepth(depth, 'STANDARD');
    checks.add('unit_tests');
    checks.add('integration_tests');
  }

  if (incidents && incidents.recent_count > 0) {
    reasons.push('INCIDENT_HISTORY');
    if (incidents.severity_max === 'critical' || incidents.severity_max === 'high') {
      risk = maxRisk(risk, 'CRITICAL');
      depth = maxDepth(depth, 'EXPERT');
    } else {
      risk = maxRisk(risk, 'HIGH');
      depth = maxDepth(depth, 'THOROUGH');
    }
    checks.add('e2e_tests');
    checks.add('architecture_review');
  }

  if (checks.size === 0) {
    for (const c of defaultChecksForRisk(risk)) checks.add(c);
  }

  return {
    risk,
    review_depth: depth,
    recommended_checks: [...checks].slice(0, 16),
    reason_codes: [...new Set(reasons)].slice(0, 24) as ReasonCode[],
  };
}
