import { describe, expect, it } from 'vitest';

import { stripMarkdown } from '@/lib/utils';

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
