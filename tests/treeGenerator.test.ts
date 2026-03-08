import { describe, expect, it } from 'vitest';

import { generateAsciiTree } from '@/lib/tree_generator';
import { FileNode } from '@/types/context';

function node(overrides: Partial<FileNode>): FileNode {
  return {
    id: 'id',
    name: 'name',
    path: '/name',
    kind: 'file',
    isSelected: true,
    ...overrides,
  };
}

describe('generateAsciiTree', () => {
  it('returns fallback message when nothing selected', () => {
    const input: FileNode[] = [
      node({ id: 'a', name: 'a.ts', isSelected: false }),
      node({ id: 'b', name: 'b.ts', isSelected: false }),
    ];
    expect(generateAsciiTree(input)).toBe('(No files selected)');
  });

  it('renders tree with connectors and directory suffix', () => {
    const input: FileNode[] = [
      node({
        id: 'src',
        name: 'src',
        kind: 'dir',
        children: [
          node({ id: 'a', name: 'a.ts', path: '/src/a.ts', isSelected: true }),
          node({ id: 'ignored', name: 'ignored.ts', isSelected: false }),
        ],
      }),
      node({ id: 'readme', name: 'README.md', path: '/README.md', isSelected: true }),
    ];

    const tree = generateAsciiTree(input);
    expect(tree).toContain('├── src/');
    expect(tree).toContain('│   └── a.ts');
    expect(tree).toContain('└── README.md');
    expect(tree).not.toContain('ignored.ts');
  });
});
