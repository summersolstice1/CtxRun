import { describe, expect, it } from 'vitest';

import { applyPatches, parseMultiFilePatch } from '@/lib/patch_parser';

describe('patch parser', () => {
  it('parses patch without file headers into current_file bucket', () => {
    const text = `
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE
`.trim();

    const patches = parseMultiFilePatch(text);
    expect(patches).toHaveLength(1);
    expect(patches[0].filePath).toBe('current_file');
    expect(patches[0].operations).toHaveLength(1);
    expect(patches[0].operations[0].originalBlock).toBe('old');
    expect(patches[0].operations[0].modifiedBlock).toBe('new');
  });

  it('merges operations for duplicated file headers', () => {
    const text = `
### File: src/a.ts
<<<<<<< SEARCH
const a = 1;
=======
const a = 2;
>>>>>>> REPLACE

### File: src/b.ts
<<<<<<< SEARCH
let b = 1;
=======
let b = 2;
>>>>>>> REPLACE

### File: src/a.ts
<<<<<<< SEARCH
console.log(a);
=======
console.log("a", a);
>>>>>>> REPLACE
`.trim();

    const patches = parseMultiFilePatch(text);
    const aPatch = patches.find((p) => p.filePath === 'src/a.ts');
    const bPatch = patches.find((p) => p.filePath === 'src/b.ts');

    expect(aPatch?.operations).toHaveLength(2);
    expect(bPatch?.operations).toHaveLength(1);
  });

  it('applyPatches replaces exact match blocks', () => {
    const source = 'const value = 1;\nconsole.log(value);\n';
    const result = applyPatches(source, [
      { originalBlock: 'const value = 1;', modifiedBlock: 'const value = 2;' },
    ]);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.modified).toContain('const value = 2;');
  });

  it('applyPatches supports newline normalization between CRLF and LF', () => {
    const source = 'line1\r\nline2\r\n';
    const result = applyPatches(source, [
      { originalBlock: 'line1\nline2\n', modifiedBlock: 'line1\nchanged\n' },
    ]);

    expect(result.success).toBe(true);
    expect(result.modified).toContain('changed');
  });

  it('applyPatches can fuzzy replace when whitespace differs', () => {
    const source = 'function test() {\n  const x = 1;    \n}\n';
    const result = applyPatches(source, [
      {
        originalBlock: 'function test(){const x=1;}',
        modifiedBlock: 'function test() {\n  const x = 2;\n}',
      },
    ]);

    expect(result.success).toBe(true);
    expect(result.modified).toContain('const x = 2;');
  });

  it('applyPatches reports errors when block is missing', () => {
    const source = 'alpha\nbeta\n';
    const result = applyPatches(source, [
      { originalBlock: 'gamma', modifiedBlock: 'delta' },
    ]);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Could not locate block');
    expect(result.modified).toBe(source);
  });
});
