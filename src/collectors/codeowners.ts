import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CodeownersRule {
  pattern: string;
  owners: string[];
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
    } else {
      regex += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${regex}$`, 'i').test(normalizedValue);
}

function validOwner(value: string): boolean {
  return /^@[A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9-]*)?$/.test(value) ||
    /^team:[A-Za-z0-9][A-Za-z0-9-]*$/.test(value);
}

export function parseCodeowners(content: string): CodeownersRule[] {
  return content.split(/\r?\n/).flatMap(line => {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) return [];
    const parts = clean.split(/\s+/);
    const pattern = parts.shift();
    const owners = parts.filter(validOwner);
    return pattern && owners.length ? [{ pattern, owners }] : [];
  });
}

export function loadCodeowners(workspace: string): CodeownersRule[] {
  for (const relative of ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']) {
    const path = resolve(workspace, relative);
    if (existsSync(path)) {
      if (statSync(path).size > 1_000_000) throw new Error('CODEOWNERS exceeds 1MB');
      return parseCodeowners(readFileSync(path, 'utf8'));
    }
  }
  return [];
}

export function suggestCodeowners(
  rules: CodeownersRule[],
  changedPaths: string[],
  sensitivePaths: string[],
): string[] {
  const sensitive = new Set(sensitivePaths);
  const suggestions: string[] = [];
  for (const path of changedPaths) {
    if (!sensitive.has(path)) continue;
    const matching = rules.filter(rule => globMatches(rule.pattern, path));
    const last = matching.at(-1);
    for (const owner of last?.owners ?? []) {
      if (!suggestions.includes(owner)) suggestions.push(owner);
    }
  }
  return suggestions.slice(0, 20);
}
