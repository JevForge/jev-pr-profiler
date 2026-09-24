import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSentinelEvidence } from '../../src/collectors/sentinel.js';

describe('Sentinel evidence', () => {
  it('prefers the Sentinel JSON artifact and does not double-count SARIF', () => {
    const root = mkdtempSync(join(tmpdir(), 'jev-profiler-sentinel-'));
    writeFileSync(join(root, 'report.json'), JSON.stringify({
      findings: [
        { severity: 'critical', category: 'secrets', path: 'src/auth.ts', in_change: true },
        { severity: 'high', category: 'sast', path: 'src/api.ts', in_change: false },
      ],
    }));
    writeFileSync(join(root, 'report.sarif'), JSON.stringify({ runs: [{ results: [
      { level: 'error', ruleId: 'duplicate' },
    ] }] }));

    const result = loadSentinelEvidence(root, 'report.json', 'report.sarif', ['src/auth.ts']);
    expect(result?.source).toBe('sentinel-json');
    expect(result?.summary).toMatchObject({ total: 2, critical: 1, high: 1, in_change: 1 });
  });

  it('falls back to SARIF and maps levels to the compact security summary', () => {
    const root = mkdtempSync(join(tmpdir(), 'jev-profiler-sarif-'));
    writeFileSync(join(root, 'report.sarif'), JSON.stringify({
      runs: [{
        tool: { driver: { name: 'JEV Security Sentinel', rules: [
          { id: 'secret-rule', properties: { 'security-severity': '9.1', tags: ['secret'] } },
        ] } },
        results: [{ ruleId: 'secret-rule', level: 'error', locations: [
          { physicalLocation: { artifactLocation: { uri: 'src/auth.ts' } } },
        ] }],
      }],
    }));
    const result = loadSentinelEvidence(root, 'missing.json', 'report.sarif', ['src/auth.ts']);
    expect(result?.source).toBe('sentinel-sarif');
    expect(result?.summary).toMatchObject({ total: 1, critical: 1, in_change: 1 });
  });

  it('rejects artifacts that escape the workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'jev-profiler-escape-'));
    expect(() => loadSentinelEvidence(root, '../outside.json', 'missing.sarif', [])).toThrow(/workspace/);
  });
});
