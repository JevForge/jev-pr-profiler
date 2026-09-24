import { z } from 'zod';
import { DiffFileSchema, type DiffFile } from '../schemas/profiler.js';

const ChangedPathObjectSchema = z.object({
  filename: z.string().min(1).max(512),
  status: z.string().min(1).max(32).optional(),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
  changes: z.number().int().nonnegative().optional(),
  previous_filename: z.string().max(512).optional(),
});

/**
 * Parse `changed_paths` input.
 * Accepts:
 * - JSON array of path strings
 * - JSON array of objects with optional additions/deletions/status
 * - Comma/newline-separated path strings (stats default to 0)
 */
export function parseChangedPaths(raw: string): DiffFile[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(item => {
        if (typeof item === 'string') {
          return DiffFileSchema.parse({
            filename: item,
            status: 'modified',
            additions: 0,
            deletions: 0,
          });
        }
        const obj = ChangedPathObjectSchema.parse(item);
        return DiffFileSchema.parse({
          filename: obj.filename,
          status: obj.status ?? 'modified',
          additions: obj.additions ?? 0,
          deletions: obj.deletions ?? 0,
          changes: obj.changes,
          previous_filename: obj.previous_filename,
        });
      });
    }
  } catch {
    // fall through to delimiter split
  }

  return trimmed
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(filename =>
      DiffFileSchema.parse({
        filename,
        status: 'modified',
        additions: 0,
        deletions: 0,
      }),
    );
}
