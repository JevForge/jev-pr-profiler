import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  SecurityFindingSummarySchema,
  type SecurityFindingSummary,
} from '../schemas/profiler.js';

const FindingRowSchema = z.object({
  severity: z.string().optional(),
  category: z.string().optional(),
  in_change: z.boolean().optional(),
  path: z.string().optional(),
});

const FindingsFileSchema = z.union([
  z.array(FindingRowSchema),
  z.object({
    findings: z.array(FindingRowSchema).optional(),
    summary: SecurityFindingSummarySchema.partial().optional(),
  }),
]);

function normalizeSeverity(raw: string | undefined): 'critical' | 'high' | 'medium' | 'low' | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s === 'critical' || s === 'blocker') return 'critical';
  if (s === 'high' || s === 'error') return 'high';
  if (s === 'medium' || s === 'moderate' || s === 'warning') return 'medium';
  if (s === 'low' || s === 'info' || s === 'note') return 'low';
  return null;
}

/**
 * Load a compact security findings summary for Jev evidence.
 * Accepts either a precomputed summary or a findings array.
 */
export function loadSecurityFindings(
  workspacePath: string,
  relativePath: string,
): SecurityFindingSummary | null {
  const full = resolve(workspacePath, relativePath);
  if (!existsSync(full)) return null;

  const parsed = FindingsFileSchema.parse(JSON.parse(readFileSync(full, 'utf8')));
  if (!Array.isArray(parsed) && parsed.summary) {
    return SecurityFindingSummarySchema.parse({
      total: parsed.summary.total ?? 0,
      critical: parsed.summary.critical ?? 0,
      high: parsed.summary.high ?? 0,
      medium: parsed.summary.medium ?? 0,
      low: parsed.summary.low ?? 0,
      categories: parsed.summary.categories ?? [],
      in_change: parsed.summary.in_change ?? 0,
    });
  }

  const rows = Array.isArray(parsed) ? parsed : (parsed.findings ?? []);
  const categories = new Set<string>();
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  let in_change = 0;

  for (const row of rows) {
    const sev = normalizeSeverity(row.severity);
    if (sev === 'critical') critical += 1;
    else if (sev === 'high') high += 1;
    else if (sev === 'medium') medium += 1;
    else if (sev === 'low') low += 1;
    if (row.category) categories.add(row.category.slice(0, 64));
    if (row.in_change) in_change += 1;
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
