import { describe, expect, it } from 'vitest';

import { cn, getPathLabel, stripMarkdown } from '@/lib/utils';

describe('stripMarkdown', () => {
  it('removes markdown syntax while keeping readable text', () => {
    const md = `
# Title
> quote line

This is **bold** and _italic_ and \`inline\`.

[link text](https://example.com)
![img alt](https://example.com/a.png)

---

\`\`\`ts
const a = 1;
\`\`\`
`;
    const text = stripMarkdown(md);

    expect(text).toContain('Title');
    expect(text).toContain('quote line');
    expect(text).toContain('This is bold and italic and inline.');
    expect(text).toContain('link text');
    expect(text).toContain('img alt');
    expect(text).toContain('const a = 1;');
    expect(text).not.toContain('```');
    expect(text).not.toContain('**');
    expect(text).not.toContain('[');
    expect(text).not.toContain('](');
  });

  it('returns empty string for empty input', () => {
    expect(stripMarkdown('')).toBe('');
  });
});

describe('getPathLabel', () => {
  it('extracts folder name from unix and windows paths', () => {
    expect(getPathLabel('/home/user/project')).toBe('project');
    expect(getPathLabel('C:\\Users\\Flynn\\CtxRun\\')).toBe('CtxRun');
  });

  it('handles empty and root-like paths', () => {
    expect(getPathLabel(undefined)).toBe('');
    expect(getPathLabel('')).toBe('');
    expect(getPathLabel('/')).toBe('/');
  });
});

describe('cn', () => {
  it('merges tailwind class conflicts', () => {
    expect(cn('px-2', 'px-4', false && 'hidden', 'text-sm')).toBe('px-4 text-sm');
  });
});
