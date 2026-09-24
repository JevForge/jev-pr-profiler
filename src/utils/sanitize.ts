const SECRET_PATTERNS: RegExp[] = [
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bAI_GATEWAY_API_KEY\s*[:=]\s*\S+/gi,
  /\bTYPESAFE_API_KEY\s*[:=]\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9._\-+=\/]{20,}/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 15))}\n…[truncated]`;
}

export function sanitizeText(text: string, maxChars = 4_000): string {
  return truncate(redactSecrets(text).trim(), maxChars);
}

export function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  return raw.toLowerCase() === 'true';
}

export function parseStringList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(String).map(s => s.trim()).filter(Boolean);
    }
  } catch {
    // fall through to delimiter split
  }
  return raw
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}
