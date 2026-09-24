import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { IncidentSignalsSchema, type IncidentSignals } from '../schemas/profiler.js';

const IncidentRowSchema = z.object({
  id: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  component: z.string().optional(),
  occurred_at: z.string().optional(),
  days_ago: z.number().optional(),
});

const IncidentsFileSchema = z.union([
  z.array(IncidentRowSchema),
  z.object({
    incidents: z.array(IncidentRowSchema).optional(),
    days_lookback: z.number().int().positive().optional(),
    summary: IncidentSignalsSchema.partial().optional(),
  }),
]);

const SEV_RANK = { none: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;

/**
 * Load recent incident history related to components touched by the PR.
 */
export function loadIncidentSignals(
  workspacePath: string,
  relativePath: string,
  relatedPaths: string[] = [],
  daysLookback = 90,
): IncidentSignals | null {
  const full = resolve(workspacePath, relativePath);
  if (!existsSync(full)) return null;

  const parsed = IncidentsFileSchema.parse(JSON.parse(readFileSync(full, 'utf8')));
  if (!Array.isArray(parsed) && parsed.summary) {
    return IncidentSignalsSchema.parse({
      recent_count: parsed.summary.recent_count ?? 0,
      severity_max: parsed.summary.severity_max ?? 'none',
      related_components: parsed.summary.related_components ?? [],
      days_lookback: parsed.summary.days_lookback ?? parsed.days_lookback ?? daysLookback,
    });
  }

  const rows = Array.isArray(parsed) ? parsed : (parsed.incidents ?? []);
  const lookback = !Array.isArray(parsed) && parsed.days_lookback
    ? parsed.days_lookback
    : daysLookback;

  const pathBlob = relatedPaths.join(' ').toLowerCase();
  const components = new Set<string>();
  let severity_max: keyof typeof SEV_RANK = 'none';
  let recent_count = 0;

  for (const row of rows) {
    const daysAgo =
      typeof row.days_ago === 'number'
        ? row.days_ago
        : row.occurred_at
          ? Math.floor(
              (Date.now() - Date.parse(row.occurred_at)) / (24 * 60 * 60 * 1000),
            )
          : 0;
    if (!Number.isFinite(daysAgo) || daysAgo > lookback) continue;

    const component = row.component?.toLowerCase() ?? '';
    const related =
      !component ||
      relatedPaths.length === 0 ||
      pathBlob.includes(component) ||
      relatedPaths.some(p => p.toLowerCase().includes(component));

    if (!related) continue;
    recent_count += 1;
    if (row.component) components.add(row.component.slice(0, 128));
    const sev = row.severity ?? 'low';
    if (SEV_RANK[sev] > SEV_RANK[severity_max]) severity_max = sev;
  }

  return IncidentSignalsSchema.parse({
    recent_count,
    severity_max,
    related_components: [...components].slice(0, 20),
    days_lookback: lookback,
  });
}
