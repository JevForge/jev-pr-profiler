import { z } from 'zod';
import { SecurityFindingSummarySchema, type SecurityFindingSummary } from '../schemas/profiler.js';
import { readWorkspaceJson } from '../utils/workspace-file.js';

export interface SentinelEvidence {
  source: 'sentinel-json' | 'sentinel-sarif';
  summary: SecurityFindingSummary;
}

const SentinelFindingSchema = z.object({
  severity: z.string().optional(),
  category: z.string().optional(),
  path: z.string().optional().nullable(),
  in_change: z.boolean().optional(),
}).passthrough();

const SentinelReportSchema = z.object({
  findings: z.array(SentinelFindingSchema).max(5000),
}).passthrough();

function severity(raw: unknown): 'critical' | 'high' | 'medium' | 'low' | null {
  if (typeof raw === 'number' || (typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw))) {
    const score = Number(raw);
    if (score >= 9) return 'critical';
    if (score >= 7) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
  }
  const value = String(raw ?? '').toLowerCase();
  if (value === 'critical' || value === 'blocker') return 'critical';
  if (value === 'high' || value === 'error') return 'high';
  if (value === 'medium' || value === 'warning') return 'medium';
  if (value === 'low' || value === 'info' || value === 'note') return 'low';
  return null;
}

function summarizeRows(rows: Array<{ severity?: unknown; category?: unknown; path?: unknown; in_change?: boolean }>, changedPaths: string[]): SecurityFindingSummary {
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  let in_change = 0;
  const categories = new Set<string>();
  for (const row of rows) {
    const level = severity(row.severity);
    if (level === 'critical') critical += 1;
    else if (level === 'high') high += 1;
    else if (level === 'medium') medium += 1;
    else if (level === 'low') low += 1;
    if (typeof row.category === 'string') categories.add(row.category.slice(0, 64));
    if (row.in_change === true || (typeof row.path === 'string' && changedPaths.includes(row.path))) in_change += 1;
  }
  return SecurityFindingSummarySchema.parse({
    total: rows.length,
    critical,
    high,
    medium,
    low,
    categories: [...categories].slice(0, 16),
    in_change,
  });
}

function sarifSummary(raw: unknown, changedPaths: string[]): SecurityFindingSummary {
  const doc = z.object({ runs: z.array(z.unknown()) }).parse(raw);
  const rows: Array<{ severity: unknown; category: string; path?: string; in_change?: boolean }> = [];
  for (const run of doc.runs) {
    if (!run || typeof run !== 'object') continue;
    const record = run as Record<string, unknown>;
    const tool = record.tool as Record<string, unknown> | undefined;
    const driver = tool?.driver as Record<string, unknown> | undefined;
    const rules = new Map<string, Record<string, unknown>>();
    for (const rule of Array.isArray(driver?.rules) ? driver.rules : []) {
      if (!rule || typeof rule !== 'object') continue;
      const ruleRecord = rule as Record<string, unknown>;
      if (typeof ruleRecord.id === 'string') rules.set(ruleRecord.id, ruleRecord);
    }
    const results = Array.isArray(record.results) ? record.results : [];
    for (const result of results) {
      if (!result || typeof result !== 'object') continue;
      const item = result as Record<string, unknown>;
      const rule = typeof item.ruleId === 'string' ? rules.get(item.ruleId) : undefined;
      const locations = Array.isArray(item.locations) ? item.locations : [];
      const first = locations[0] as Record<string, unknown> | undefined;
      const physical = first?.physicalLocation as Record<string, unknown> | undefined;
      const artifact = physical?.artifactLocation as Record<string, unknown> | undefined;
      const path = typeof artifact?.uri === 'string' ? artifact.uri : undefined;
      const properties = (rule?.properties ?? item.properties) as Record<string, unknown> | undefined;
      const message = item.message as Record<string, unknown> | undefined;
      const text = typeof message?.text === 'string' ? message.text.toLowerCase() : '';
      const category = text.includes('secret') ? 'secrets' : 'sast';
      const messageSeverity = typeof message?.text === 'string'
        ? message.text.trim().split(/\s+/)[0]
        : undefined;
      rows.push({
        severity: properties?.['security-severity'] ?? messageSeverity ?? item.level,
        category,
        path,
        in_change: path ? changedPaths.includes(path) : false,
      });
    }
  }
  return summarizeRows(rows, changedPaths);
}

export function loadSentinelEvidence(
  workspace: string,
  reportPath: string,
  sarifPath: string,
  changedPaths: string[],
): SentinelEvidence | null {
  const report = readWorkspaceJson(workspace, reportPath, 'Sentinel artifact');
  if (report !== null) {
    const parsed = SentinelReportSchema.parse(report);
    return {
      source: 'sentinel-json',
      summary: summarizeRows(parsed.findings, changedPaths),
    };
  }
  const sarif = readWorkspaceJson(workspace, sarifPath, 'Sentinel artifact');
  if (sarif === null) return null;
  return { source: 'sentinel-sarif', summary: sarifSummary(sarif, changedPaths) };
}
