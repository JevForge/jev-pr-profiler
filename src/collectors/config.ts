import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import {
  JEV_PROVIDERS,
  LOW_CONFIDENCE_POLICIES,
  type JevProviderId,
  type LowConfidencePolicy,
} from '../schemas/enums.js';

const JeConfigSchema = z.object({
  jev_provider: z.enum(JEV_PROVIDERS).optional(),
  jev_endpoint: z.string().url().optional(),
  jev_model: z.string().min(1).optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  low_confidence_policy: z.enum(LOW_CONFIDENCE_POLICIES).optional(),
  comment_on_github: z.boolean().optional(),
  apply_labels: z.boolean().optional(),
  create_check_run: z.boolean().optional(),
  write_report_artifact: z.boolean().optional(),
  max_files: z.number().int().positive().optional(),
  security_findings_path: z.string().optional(),
  coverage_path: z.string().optional(),
  incidents_path: z.string().optional(),
  sentinel_report_path: z.string().optional(),
  sentinel_sarif_path: z.string().optional(),
  structured_logs: z.boolean().optional(),
  fail_on_risk: z.enum(['HIGH', 'CRITICAL']).optional(),
  request_codeowners_reviewers: z.boolean().optional(),
});

export type JeConfig = z.infer<typeof JeConfigSchema>;

export function loadJeConfig(
  workspacePath: string,
  relativePath = '.jev/config.yml',
): JeConfig {
  const full = resolve(workspacePath, relativePath);
  if (!existsSync(full)) return {};
  const raw = YAML.parse(readFileSync(full, 'utf8')) ?? {};
  return JeConfigSchema.parse(raw);
}

export function coalesceProvider(
  input?: string,
  config?: JeConfig,
): JevProviderId {
  const value = (input || config?.jev_provider || 'vercel-ai-gateway') as JevProviderId;
  if (!JEV_PROVIDERS.includes(value)) {
    throw new Error(`Unsupported jev_provider: ${value}`);
  }
  return value;
}

export function coalescePolicy(
  input?: string,
  config?: JeConfig,
): LowConfidencePolicy {
  return (input || config?.low_confidence_policy || 'fail') as LowConfidencePolicy;
}
