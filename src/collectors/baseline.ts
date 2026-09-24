import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import {
  DEPTH_RANK,
  RISK_RANK,
  REVIEW_DEPTHS,
  RISK_LEVELS,
  type RecommendedCheck,
  type ReviewDepth,
  type RiskLevel,
} from '../schemas/enums.js';
import { RECOMMENDED_CHECKS, type ReasonCode } from '../schemas/enums.js';
import type { DeterministicFloor } from '../decision/floor.js';

const BaselineRuleSchema = z.object({
  paths: z.array(z.string().min(1).max(256)).min(1).max(50),
  risk: z.enum(RISK_LEVELS).optional(),
  review_depth: z.enum(REVIEW_DEPTHS).optional(),
  recommended_checks: z.array(z.enum(RECOMMENDED_CHECKS)).max(16).optional(),
  skip_jev: z.boolean().default(false),
}).strict();

const BaselineConfigSchema = z.object({
  version: z.literal(1),
  floors: z.array(BaselineRuleSchema).max(100).default([]),
  overrides: z.array(BaselineRuleSchema).max(100).default([]),
}).strict();

export type BaselineRule = z.infer<typeof BaselineRuleSchema>;
export type BaselineConfig = z.infer<typeof BaselineConfigSchema>;

export interface BaselineMatch {
  matched_rules: string[];
  risk: RiskLevel | null;
  review_depth: ReviewDepth | null;
  recommended_checks: RecommendedCheck[];
  skip_jev: boolean;
}

export function parseBaselineConfig(raw: unknown): BaselineConfig {
  return BaselineConfigSchema.parse(raw);
}

export function loadBaselineConfig(
  workspace: string,
  relativePath = '.jev/pr-profiler.yml',
): BaselineConfig | null {
  const root = resolve(workspace);
  const path = resolve(root, relativePath);
  if (path !== root && !path.startsWith(`${root}/`) && !path.startsWith(`${root}\\`)) {
    throw new Error('Baseline config path escapes workspace');
  }
  if (!existsSync(path)) return null;
  if (statSync(path).size > 1_000_000) throw new Error('Baseline config exceeds 1MB');
  return parseBaselineConfig(YAML.parse(readFileSync(path, 'utf8')));
}

function globMatches(pattern: string, value: string): boolean {
  const normalizedPattern = pattern.replaceAll('\\', '/').replace(/^\/+/, '');
  const normalizedValue = value.replaceAll('\\', '/').replace(/^\/+/, '');
  let regex = '^';
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const char = normalizedPattern[index];
    if (char === '*' && normalizedPattern[index + 1] === '*') {
      regex += '.*';
      index += 1;
    } else if (char === '*') {
      regex += '[^/]*';
    } else if (char === '?') {
      regex += '[^/]';
    } else {
      regex += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${regex}$`, 'i').test(normalizedValue);
}

function mergeRisk(current: RiskLevel | null, next: RiskLevel | undefined): RiskLevel | null {
  if (!next) return current;
  if (!current || RISK_RANK[next] > RISK_RANK[current]) return next;
  return current;
}

function mergeDepth(current: ReviewDepth | null, next: ReviewDepth | undefined): ReviewDepth | null {
  if (!next) return current;
  if (!current || DEPTH_RANK[next] > DEPTH_RANK[current]) return next;
  return current;
}

export function matchBaseline(config: BaselineConfig | null, paths: string[]): BaselineMatch {
  const match: BaselineMatch = {
    matched_rules: [],
    risk: null,
    review_depth: null,
    recommended_checks: [],
    skip_jev: false,
  };
  if (!config || paths.length === 0) return match;
  const rules = [
    ...config.floors.map((rule, index) => ({ rule, id: `floors[${index}]` })),
    ...config.overrides.map((rule, index) => ({ rule, id: `overrides[${index}]` })),
  ];
  const skipMatches = new Set<string>();
  for (const { rule, id } of rules) {
    const matchingPaths = paths.filter(path => rule.paths.some(pattern => globMatches(pattern, path)));
    if (!matchingPaths.length) continue;
    match.matched_rules.push(id);
    match.risk = mergeRisk(match.risk, rule.risk);
    match.review_depth = mergeDepth(match.review_depth, rule.review_depth);
    for (const check of rule.recommended_checks ?? []) {
      if (!match.recommended_checks.includes(check as RecommendedCheck)) {
        match.recommended_checks.push(check as RecommendedCheck);
      }
    }
    if (rule.skip_jev) {
      for (const path of matchingPaths) skipMatches.add(path);
    }
  }
  match.skip_jev = paths.every(path => skipMatches.has(path)) && skipMatches.size > 0;
  return match;
}

export function applyBaselineToFloor(
  floor: DeterministicFloor,
  baseline: BaselineMatch,
): DeterministicFloor {
  if (baseline.matched_rules.length === 0) return floor;
  const risk = baseline.risk ? mergeRisk(floor.risk, baseline.risk) ?? floor.risk : floor.risk;
  const review_depth = baseline.review_depth
    ? mergeDepth(floor.review_depth, baseline.review_depth) ?? floor.review_depth
    : floor.review_depth;
  return {
    risk,
    review_depth,
    recommended_checks: [...new Set([...floor.recommended_checks, ...baseline.recommended_checks])].slice(0, 16) as RecommendedCheck[],
    reason_codes: [...new Set([...floor.reason_codes, 'BASELINE_FLOOR'])].slice(0, 24) as ReasonCode[],
  };
}
