import { describe, it, expect } from 'vitest';
import { parseConfigString } from '../src/lib/firebase';

describe('Firebase Configuration String Parser', () => {
  it('parses strict JSON object string correctly', () => {
    const raw = '{"apiKey":"AIzaSyTest123","projectId":"my-florify-prod","firestoreDatabaseId":"custom-db"}';
    const parsed = parseConfigString(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.apiKey).toBe('AIzaSyTest123');
    expect(parsed.projectId).toBe('my-florify-prod');
    expect(parsed.firestoreDatabaseId).toBe('custom-db');
  });

  it('handles strings wrapped in outer single or double quotes', () => {
    const wrappedSingle = '\'{"apiKey":"AIzaKey","projectId":"proj-1"}\'';
    const parsedSingle = parseConfigString(wrappedSingle);
    expect(parsedSingle.apiKey).toBe('AIzaKey');
    expect(parsedSingle.projectId).toBe('proj-1');

    const wrappedDouble = '"{\\"apiKey\\":\\"AIzaKey2\\",\\"projectId\\":\\"proj-2\\"}"';
    const parsedDouble = parseConfigString(wrappedDouble);
    expect(parsedDouble.apiKey).toBe('AIzaKey2');
    expect(parsedDouble.projectId).toBe('proj-2');
  });

  it('handles JS variable declarations and trailing semicolons', () => {
    const snippet = `const firebaseConfig = {
      apiKey: "AIzaVarKey",
      projectId: "proj-var",
      firestoreDatabaseId: "(default)"
    };`;
    const parsed = parseConfigString(snippet);
    expect(parsed).not.toBeNull();
    expect(parsed.apiKey).toBe('AIzaVarKey');
    expect(parsed.projectId).toBe('proj-var');
    expect(parsed.firestoreDatabaseId).toBe('(default)');
  });

  it('handles JS objects with unquoted keys and single quotes', () => {
    const jsObj = "{ apiKey: 'AIzaUnquoted', projectId: 'proj-unquoted', authDomain: 'proj-unquoted.firebaseapp.com' }";
    const parsed = parseConfigString(jsObj);
    expect(parsed).not.toBeNull();
    expect(parsed.apiKey).toBe('AIzaUnquoted');
    expect(parsed.projectId).toBe('proj-unquoted');
    expect(parsed.authDomain).toBe('proj-unquoted.firebaseapp.com');
  });

  it('returns null safely for invalid or empty input', () => {
    expect(parseConfigString('')).toBeNull();
    expect(parseConfigString('   ')).toBeNull();
    expect(parseConfigString('invalid non-json string')).toBeNull();
  });
});
