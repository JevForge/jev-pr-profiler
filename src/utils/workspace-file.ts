import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export function readWorkspaceJson(
  workspace: string,
  relativePath: string,
  label: string,
  maxBytes = 20_000_000,
): unknown | null {
  const root = resolve(workspace);
  const path = resolve(root, relativePath);
  if (path !== root && !path.startsWith(`${root}/`) && !path.startsWith(`${root}\\`)) {
    throw new Error(`${label} path escapes workspace`);
  }
  if (!existsSync(path)) return null;
  if (statSync(path).size > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
