import { describe, it, expect } from 'vitest';
import { validateProjectName } from '../src/validate.js';

describe('validateProjectName', () => {
  it.each(['my-server', 'mcp.server', 'scoped_name', '@me/foo', 'a'])(
    'accepts valid name %s',
    (name) => {
      expect(validateProjectName(name)).toBe(true);
    },
  );

  it.each([
    ['', 'empty'],
    ['MyServer', 'uppercase'],
    ['.hidden', 'leading dot'],
    ['_priv', 'leading underscore'],
    ['has space', 'whitespace'],
    ['node_modules', 'reserved'],
    ['a'.repeat(215), 'too long'],
  ])('rejects %s (%s)', (name) => {
    expect(validateProjectName(name)).not.toBe(true);
  });
});
