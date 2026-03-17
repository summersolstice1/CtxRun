import { describe, expect, it } from 'vitest';

import { parseMultiFilePatch } from '@/lib/patch_parser';

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
});
