import { describe, expect, it } from 'vitest';
import { parseChangedPaths } from '../../src/collectors/changed-paths.js';

describe('parseChangedPaths', () => {
  it('parses path strings with zero stats', () => {
    const files = parseChangedPaths('["src/a.ts", "src/b.ts"]');
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ filename: 'src/a.ts', additions: 0, deletions: 0 });
  });

  it('parses objects with optional additions/deletions', () => {
    const files = parseChangedPaths(
      JSON.stringify([
        { filename: 'src/a.ts', additions: 12, deletions: 3, status: 'modified' },
        { filename: 'README.md', additions: 5 },
      ]),
    );
    expect(files[0].additions).toBe(12);
    expect(files[0].deletions).toBe(3);
    expect(files[1].additions).toBe(5);
    expect(files[1].deletions).toBe(0);
  });

  it('parses comma-separated paths', () => {
    const files = parseChangedPaths('a.ts, b.ts\nc.ts');
    expect(files.map(f => f.filename)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });
});
