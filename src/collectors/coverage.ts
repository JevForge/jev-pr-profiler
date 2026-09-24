import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { CoverageSignalsSchema, type CoverageSignals } from '../schemas/profiler.js';

const CoverageFileSchema = z.object({
  lines_pct: z.number().optional(),
  branches_pct: z.number().optional(),
  delta_lines_pct: z.number().optional(),
  uncovered_paths: z.array(z.string()).optional(),
  base: z
    .object({
      lines_pct: z.number().optional(),
      branches_pct: z.number().optional(),
    })
    .optional(),
  head: z
    .object({
      lines_pct: z.number().optional(),
      branches_pct: z.number().optional(),
    })
    .optional(),
  delta: z
    .object({
      lines_pct: z.number().optional(),
    })
    .optional(),
});

/**
 * Load coverage delta signals. Supports flat or base/head/delta shapes.
 */
export function loadCoverageSignals(
  workspacePath: string,
  relativePath: string,
): CoverageSignals | null {
  const full = resolve(workspacePath, relativePath);
  if (!existsSync(full)) return null;

  const raw = CoverageFileSchema.parse(JSON.parse(readFileSync(full, 'utf8')));
  const lines =
    raw.lines_pct ?? raw.head?.lines_pct ?? null;
  const branches =
    raw.branches_pct ?? raw.head?.branches_pct ?? null;
  let delta = raw.delta_lines_pct ?? raw.delta?.lines_pct ?? null;
  if (
    delta == null &&
    typeof raw.head?.lines_pct === 'number' &&
    typeof raw.base?.lines_pct === 'number'
  ) {
    delta = Number((raw.head.lines_pct - raw.base.lines_pct).toFixed(2));
  }

  return CoverageSignalsSchema.parse({
    lines_pct: lines,
    branches_pct: branches,
    delta_lines_pct: delta,
    uncovered_paths: (raw.uncovered_paths ?? []).slice(0, 20),
  });
}
