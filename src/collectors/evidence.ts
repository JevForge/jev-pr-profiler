import {
  PrMetadataSchema,
  type DiffSignals,
  type PrEvidence,
  type PrMetadata,
  type CoverageSignals,
  type IncidentSignals,
  type SecurityFindingSummary,
} from '../schemas/profiler.js';
import { sanitizeText } from '../utils/sanitize.js';
import { emptyDiffSignals } from './diff-signals.js';

export interface CollectedPr {
  metadata: PrMetadata;
  htmlUrl: string | null;
}

function labelsFrom(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'name' in item) {
        return String((item as { name?: unknown }).name ?? '');
      }
      return '';
    })
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

export function collectPrFromPayload(
  payload: Record<string, unknown>,
  overrides: {
    title?: string;
    body?: string;
    labels?: string[];
    pullNumber?: number;
  } = {},
): CollectedPr {
  const pr = (payload.pull_request ??
    (payload.issue &&
    typeof payload.issue === 'object' &&
    (payload.issue as { pull_request?: unknown }).pull_request
      ? payload.issue
      : undefined)) as Record<string, unknown> | undefined;

  const title = overrides.title ?? String(pr?.title ?? '');
  const body = overrides.body ?? String(pr?.body ?? '');
  const number =
    overrides.pullNumber ??
    (typeof pr?.number === 'number' ? pr.number : null);

  const user = pr?.user as { login?: string } | undefined;
  const base = pr?.base as { ref?: string } | undefined;
  const head = pr?.head as { ref?: string } | undefined;

  const metadata = PrMetadataSchema.parse({
    number,
    title: sanitizeText(title, 500),
    body_excerpt: sanitizeText(body, 4_000),
    author: typeof user?.login === 'string' ? user.login : null,
    labels: overrides.labels?.length ? overrides.labels : labelsFrom(pr?.labels),
    draft: Boolean(pr?.draft),
    base_ref: typeof base?.ref === 'string' ? base.ref : null,
    head_ref: typeof head?.ref === 'string' ? head.ref : null,
    changed_requested_reviewers: Array.isArray(pr?.requested_reviewers)
      ? pr.requested_reviewers.length
      : 0,
    commits: typeof pr?.commits === 'number' ? pr.commits : null,
  });

  return {
    metadata,
    htmlUrl: typeof pr?.html_url === 'string' ? pr.html_url : null,
  };
}

export function buildEvidence(input: {
  metadata: PrMetadata;
  diff?: DiffSignals;
  security?: SecurityFindingSummary | null;
  coverage?: CoverageSignals | null;
  incidents?: IncidentSignals | null;
}): PrEvidence {
  return {
    metadata: input.metadata,
    diff: input.diff ?? emptyDiffSignals(),
    security: input.security ?? null,
    coverage: input.coverage ?? null,
    incidents: input.incidents ?? null,
  };
}
