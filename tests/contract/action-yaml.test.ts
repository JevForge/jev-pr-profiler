import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const root = resolve(import.meta.dirname, '../..');
const action = YAML.parse(readFileSync(resolve(root, 'action.yml'), 'utf8')) as {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  runs: { using: string; main: string };
};

function workflowFiles(): string[] {
  return ['examples/basic.yml', 'examples/gate.yml', 'examples/pr-profile.yml'];
}

describe('GitHub Action YAML contract', () => {
  it('declares the expected runtime and metadata maps', () => {
    expect(action.runs).toMatchObject({ using: 'node24', main: 'dist/index.js' });
    expect(Object.keys(action.inputs).length).toBeGreaterThan(0);
    expect(Object.keys(action.outputs)).toContain('review_checklist');
  });

  it('accepts only declared inputs and outputs in every example', () => {
    const inputIds = new Set(Object.keys(action.inputs));
    const outputIds = new Set(Object.keys(action.outputs));
    for (const relative of workflowFiles()) {
      const text = readFileSync(resolve(root, relative), 'utf8');
      const workflow = YAML.parse(text) as { jobs?: Record<string, unknown> };
      expect(workflow.jobs).toBeTruthy();
      for (const job of Object.values(workflow.jobs ?? {})) {
        const steps = (job as { steps?: Array<{ with?: Record<string, unknown> }> }).steps ?? [];
        for (const step of steps) {
          for (const key of Object.keys(step.with ?? {})) {
            expect(inputIds.has(key), `${relative}: ${key}`).toBe(true);
          }
        }
      }
      for (const match of text.matchAll(/steps\.[A-Za-z0-9_-]+\.outputs\.([A-Za-z0-9_-]+)/g)) {
        expect(outputIds.has(match[1]), `${relative}: ${match[1]}`).toBe(true);
      }
    }
  });
});
