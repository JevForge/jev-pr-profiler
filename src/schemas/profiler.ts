import { z } from 'zod';
import {
  DECISIONS,
  JEV_PROVIDERS,
  JEV_STATUSES,
  LOW_CONFIDENCE_POLICIES,
  REASON_CODES,
  RECOMMENDED_CHECKS,
  REVIEW_DEPTHS,
  RISK_LEVELS,
  DIFF_AREAS,
  REVIEW_CHECKLIST_ITEMS,
  FAIL_ON_RISK_LEVELS,
} from './enums.js';

export const DiffFileSchema = z.object({
  filename: z.string().min(1).max(512),
  status: z.string().min(1).max(32),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
  changes: z.number().int().nonnegative().optional(),
  previous_filename: z.string().max(512).optional(),
});

export type DiffFile = z.infer<typeof DiffFileSchema>;

export const DiffAreaSummarySchema = z.object({
  area: z.enum(DIFF_AREAS),
  file_count: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  paths: z.array(z.string().max(512)).max(20),
}).strict();

export type DiffAreaSummary = z.infer<typeof DiffAreaSummarySchema>;

export const DiffSignalsSchema = z
  .object({
    file_count: z.number().int().nonnegative(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    languages: z.array(z.string().max(32)).max(32),
    top_paths: z.array(z.string().max(512)).max(40),
    sensitive_paths: z.array(z.string().max(512)).max(20),
    touch_tests: z.boolean(),
    touch_infra: z.boolean(),
    touch_auth: z.boolean(),
    touch_docs_only: z.boolean(),
    touch_migrations: z.boolean(),
    estimated_diff_tokens: z.number().int().nonnegative(),
    areas: z.array(DiffAreaSummarySchema).max(4),
  })
  .strict();

export type DiffSignals = z.infer<typeof DiffSignalsSchema>;

export const SecurityFindingSummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
    categories: z.array(z.string().max(64)).max(16),
    in_change: z.number().int().nonnegative().default(0),
  })
  .strict();

export type SecurityFindingSummary = z.infer<typeof SecurityFindingSummarySchema>;

export const CoverageSignalsSchema = z
  .object({
    lines_pct: z.number().min(0).max(100).nullable(),
    branches_pct: z.number().min(0).max(100).nullable(),
    delta_lines_pct: z.number().min(-100).max(100).nullable(),
    uncovered_paths: z.array(z.string().max(512)).max(20),
  })
  .strict();

export type CoverageSignals = z.infer<typeof CoverageSignalsSchema>;

export const IncidentSignalsSchema = z
  .object({
    recent_count: z.number().int().nonnegative(),
    severity_max: z.enum(['none', 'low', 'medium', 'high', 'critical']),
    related_components: z.array(z.string().max(128)).max(20),
    days_lookback: z.number().int().positive().default(90),
  })
  .strict();

export type IncidentSignals = z.infer<typeof IncidentSignalsSchema>;

export const PrMetadataSchema = z
  .object({
    number: z.number().int().positive().nullable(),
    title: z.string().max(500),
    body_excerpt: z.string().max(4_000),
    author: z.string().max(128).nullable(),
    labels: z.array(z.string().max(64)).max(40),
    draft: z.boolean().default(false),
    base_ref: z.string().max(256).nullable(),
    head_ref: z.string().max(256).nullable(),
    changed_requested_reviewers: z.number().int().nonnegative().default(0),
    commits: z.number().int().nonnegative().nullable(),
  })
  .strict();

export type PrMetadata = z.infer<typeof PrMetadataSchema>;

export const PrEvidenceSchema = z
  .object({
    metadata: PrMetadataSchema,
    diff: DiffSignalsSchema,
    security: SecurityFindingSummarySchema.nullable(),
    coverage: CoverageSignalsSchema.nullable(),
    incidents: IncidentSignalsSchema.nullable(),
  })
  .strict();

export type PrEvidence = z.infer<typeof PrEvidenceSchema>;

export const ProfilerInputsSchema = z.object({
  min_confidence: z.number().min(0).max(1).default(0.7),
  low_confidence_policy: z.enum(LOW_CONFIDENCE_POLICIES).default('fail'),
  jev_provider: z.enum(JEV_PROVIDERS).default('vercel-ai-gateway'),
  jev_endpoint: z.string().url().optional(),
  jev_model: z.string().min(1).optional(),
  timeout_ms: z.number().int().positive().max(120_000).default(45_000),
  comment_on_github: z.boolean().default(false),
  apply_labels: z.boolean().default(false),
  create_check_run: z.boolean().default(true),
  write_report_artifact: z.boolean().default(false),
  dry_run: z.boolean().default(false),
  max_files: z.number().int().positive().max(500).default(100),
  fail_on_risk: z.enum(FAIL_ON_RISK_LEVELS).optional(),
});

export type ProfilerInputs = z.infer<typeof ProfilerInputsSchema>;

export const ProfilerDecisionSchema = z
  .object({
    decision: z.enum(DECISIONS),
    risk_level: z.enum(RISK_LEVELS).nullable(),
    review_depth: z.enum(REVIEW_DEPTHS).nullable(),
    recommended_checks: z.array(z.enum(RECOMMENDED_CHECKS)).max(16),
    confidence: z.number().min(0).max(1),
    reason_codes: z.array(z.enum(REASON_CODES)).min(1).max(24),
    explanation: z.string().max(2_000).default(''),
    provisional: z.boolean().default(false),
    jev_status: z.enum(JEV_STATUSES),
    policy_floor_risk: z.enum(RISK_LEVELS).nullable(),
    review_checklist: z.array(z.enum(REVIEW_CHECKLIST_ITEMS)).max(10).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === 'PROFILE') {
      if (!value.risk_level) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PROFILE requires risk_level',
          path: ['risk_level'],
        });
      }
      if (!value.review_depth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PROFILE requires review_depth',
          path: ['review_depth'],
        });
      }
      if (value.recommended_checks.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PROFILE requires at least one recommended_check',
          path: ['recommended_checks'],
        });
      }
    }
    if (value.decision === 'ABSTAIN' && value.risk_level) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ABSTAIN must not set risk_level unless provisional floor applies',
        path: ['risk_level'],
      });
    }
  });

export type ProfilerDecision = z.infer<typeof ProfilerDecisionSchema>;
