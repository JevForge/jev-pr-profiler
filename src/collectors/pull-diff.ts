import type { DiffSignals } from '../schemas/profiler.js';
import { summarizeDiffFiles, toDiffFiles, type PullFileLike } from './diff-signals.js';

export interface PullFilesClient {
  listFiles(pullNumber: number): Promise<PullFileLike[]>;
}

/**
 * Fetch PR changed files via GitHub API and return a compact DiffSignals summary.
 * Never sends patch hunks — only path metadata and line counts.
 */
export async function collectPullDiffSignals(
  pullNumber: number,
  client: PullFilesClient,
  options: { maxFiles?: number } = {},
): Promise<DiffSignals> {
  const maxFiles = options.maxFiles ?? 100;
  const files = await client.listFiles(pullNumber);
  return summarizeDiffFiles(toDiffFiles(files.slice(0, maxFiles)));
}
