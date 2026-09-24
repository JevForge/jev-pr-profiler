import { extname } from 'node:path';
import {
  DiffFileSchema,
  DiffSignalsSchema,
  type DiffFile,
  type DiffSignals,
  type DiffAreaSummary,
} from '../schemas/profiler.js';
import { DIFF_AREAS, type DiffArea } from '../schemas/enums.js';

const EXT_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.md': 'markdown',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.json': 'json',
  '.toml': 'toml',
  '.sql': 'sql',
  '.sh': 'shell',
  '.ps1': 'powershell',
  '.tf': 'terraform',
};

const SENSITIVE_PATTERNS = [
  /(^|\/)(\.github\/workflows)\//i,
  /(^|\/)(auth|oauth|iam|security|secret|secrets|crypto)\//i,
  /(^|\/)(infra|terraform|pulumi|k8s|kubernetes|helm)\//i,
  /(^|\/)(\.env|\.env\.|credentials|id_rsa)/i,
  /(^|\/)(Dockerfile|docker-compose)/i,
];

const AUTH_PATTERNS = [/(^|\/)(auth|oauth|iam|session|passport|jwt)\//i];
const TEST_PATTERNS = [/(^|\/)(tests?|__tests__|spec)\//i, /\.(test|spec)\.[a-z]+$/i];
const INFRA_PATTERNS = [
  /(^|\/)(\.github|infra|deploy|terraform|helm|k8s|kubernetes)\//i,
  /\.(tf)$/i,
];
const DOC_PATTERNS = [/\.(md|mdx|txt|rst)$/i, /(^|\/)(docs|documentation)\//i];
const MIGRATION_PATTERNS = [
  /(^|\/)(migrations?|db\/migrate)\//i,
  /\.(sql)$/i,
];
const AREA_PATTERNS: Record<DiffArea, RegExp[]> = {
  auth: [/(^|\/)(auth|oauth|iam|session|passport|jwt|security)\//i],
  api: [/(^|\/)(api|routes?|controllers?|graphql|resolvers?|handlers?)\//i, /(^|\/)(openapi|swagger)(\.|\/)/i],
  infra: INFRA_PATTERNS,
  ui: [/(^|\/)(ui|components?|pages?|views?|frontend|web)\//i, /\.(tsx|jsx|vue|svelte)$/i],
};

function languageFor(filename: string): string | null {
  const base = filename.toLowerCase();
  if (base.endsWith('dockerfile') || base.includes('/dockerfile')) return 'docker';
  const ext = extname(base);
  return EXT_LANG[ext] ?? null;
}

export function summarizeDiffFiles(files: DiffFile[], maxPaths = 30): DiffSignals {
  const parsed = files.map(f => DiffFileSchema.parse(f));
  const languages = new Set<string>();
  const top_paths: string[] = [];
  const sensitive_paths: string[] = [];
  let additions = 0;
  let deletions = 0;
  let touch_tests = false;
  let touch_infra = false;
  let touch_auth = false;
  let touch_migrations = false;
  let nonDoc = 0;
  const areaStats = new Map<DiffArea, DiffAreaSummary>();

  for (const file of parsed) {
    additions += file.additions;
    deletions += file.deletions;
    const lang = languageFor(file.filename);
    if (lang) languages.add(lang);
    if (top_paths.length < maxPaths) top_paths.push(file.filename);
    if (SENSITIVE_PATTERNS.some(p => p.test(file.filename)) && sensitive_paths.length < 20) {
      sensitive_paths.push(file.filename);
    }
    if (TEST_PATTERNS.some(p => p.test(file.filename))) touch_tests = true;
    if (INFRA_PATTERNS.some(p => p.test(file.filename))) touch_infra = true;
    if (AUTH_PATTERNS.some(p => p.test(file.filename))) touch_auth = true;
    if (MIGRATION_PATTERNS.some(p => p.test(file.filename))) touch_migrations = true;
    if (!DOC_PATTERNS.some(p => p.test(file.filename))) nonDoc += 1;
    for (const area of DIFF_AREAS) {
      if (!AREA_PATTERNS[area].some(pattern => pattern.test(file.filename))) continue;
      const current = areaStats.get(area) ?? {
        area,
        file_count: 0,
        additions: 0,
        deletions: 0,
        paths: [],
      };
      current.file_count += 1;
      current.additions += file.additions;
      current.deletions += file.deletions;
      if (current.paths.length < 20) current.paths.push(file.filename);
      areaStats.set(area, current);
    }
  }

  return DiffSignalsSchema.parse({
    file_count: parsed.length,
    additions,
    deletions,
    languages: [...languages].sort(),
    top_paths,
    sensitive_paths,
    touch_tests,
    touch_infra,
    touch_auth,
    touch_docs_only: parsed.length > 0 && nonDoc === 0,
    touch_migrations,
    estimated_diff_tokens: Math.min(
      48_000,
      Math.ceil((additions + deletions) * 4 + parsed.length * 8),
    ),
    areas: DIFF_AREAS.map(area => areaStats.get(area)).filter(
      (value): value is DiffAreaSummary => value !== undefined,
    ),
  });
}

export interface PullFileLike {
  filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
  previous_filename?: string;
}

export function toDiffFiles(files: PullFileLike[]): DiffFile[] {
  return files
    .filter(f => typeof f.filename === 'string' && f.filename.length > 0)
    .map(f =>
      DiffFileSchema.parse({
        filename: f.filename,
        status: f.status ?? 'modified',
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
        changes: f.changes,
        previous_filename: f.previous_filename,
      }),
    );
}

export function emptyDiffSignals(): DiffSignals {
  return summarizeDiffFiles([]);
}
