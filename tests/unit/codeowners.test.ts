import { describe, expect, it } from 'vitest';
import { parseCodeowners, suggestCodeowners } from '../../src/collectors/codeowners.js';

describe('CODEOWNERS suggestions', () => {
  it('uses the last matching rule and only returns owners for sensitive paths', () => {
    const rules = parseCodeowners(`
      /src/* @org/general
      /src/auth/** @org/security @alice
      /docs/** @org/docs
    `);
    expect(suggestCodeowners(rules, ['src/auth/session.ts'], ['src/auth/session.ts'])).toEqual([
      '@org/security',
      '@alice',
    ]);
  });
});
