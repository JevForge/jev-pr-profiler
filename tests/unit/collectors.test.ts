import { describe, expect, it } from 'vitest';
import { loadSecurityFindings } from '../../src/collectors/security-findings.js';
import { loadCoverageSignals } from '../../src/collectors/coverage.js';
import { loadIncidentSignals } from '../../src/collectors/incidents.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const tmp = resolve('tests/fixtures/tmp-collectors');

describe('optional evidence collectors', () => {
  it('loads security, coverage, and incidents summaries', () => {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(
      resolve(tmp, 'security.json'),
      JSON.stringify({
        findings: [
          { severity: 'critical', category: 'sca', in_change: true },
          { severity: 'high', category: 'sast', in_change: false },
        ],
      }),
    );
    writeFileSync(
      resolve(tmp, 'coverage.json'),
      JSON.stringify({
        base: { lines_pct: 80 },
        head: { lines_pct: 74, branches_pct: 60 },
        uncovered_paths: ['src/a.ts'],
      }),
    );
    writeFileSync(
      resolve(tmp, 'incidents.json'),
      JSON.stringify({
        days_lookback: 90,
        incidents: [
          {
            severity: 'high',
            component: 'payments',
            days_ago: 10,
          },
          {
            severity: 'low',
            component: 'unrelated',
            days_ago: 5,
          },
        ],
      }),
    );

    const security = loadSecurityFindings(tmp, 'security.json');
    const coverage = loadCoverageSignals(tmp, 'coverage.json');
    const incidents = loadIncidentSignals(tmp, 'incidents.json', [
      'src/payments/charge.ts',
    ]);

    expect(security?.critical).toBe(1);
    expect(security?.high).toBe(1);
    expect(coverage?.delta_lines_pct).toBe(-6);
    expect(incidents?.recent_count).toBe(1);
    expect(incidents?.severity_max).toBe('high');

    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns null when files are missing', () => {
    expect(loadSecurityFindings(tmp, 'missing.json')).toBeNull();
    expect(loadCoverageSignals(tmp, 'missing.json')).toBeNull();
    expect(loadIncidentSignals(tmp, 'missing.json')).toBeNull();
  });
});
