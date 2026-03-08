import { describe, expect, it } from 'vitest';

import { generateHeader, getSelectedPaths } from '@/lib/context_assembler';
import { FileNode } from '@/types/context';

function file(id: string, name: string, selected: boolean, path: string): FileNode {
  return {
    id,
    name,
    path,
    kind: 'file',
    isSelected: selected,
  };
}

describe('context assembler', () => {
  it('getSelectedPaths returns selected file paths recursively', () => {
    const nodes: FileNode[] = [
      {
        id: 'root',
        name: 'root',
        path: '/root',
        kind: 'dir',
        isSelected: true,
        children: [
          file('a', 'a.ts', true, '/root/a.ts'),
          file('b', 'b.ts', false, '/root/b.ts'),
          {
            id: 'nested',
            name: 'nested',
            path: '/root/nested',
            kind: 'dir',
            isSelected: true,
            children: [file('c', 'c.rs', true, '/root/nested/c.rs')],
          },
        ],
      },
    ];

    expect(getSelectedPaths(nodes)).toEqual(['/root/a.ts', '/root/nested/c.rs']);
  });

  it('generateHeader includes structure and optional comment strip note', () => {
    const nodes: FileNode[] = [
      {
        id: 'src',
        name: 'src',
        path: '/src',
        kind: 'dir',
        isSelected: true,
        children: [file('a', 'a.ts', true, '/src/a.ts')],
      },
    ];

    const headerWithNote = generateHeader(nodes, true);
    expect(headerWithNote).toContain('<project_context>');
    expect(headerWithNote).toContain('Total Files: 1');
    expect(headerWithNote).toContain('Comments have been stripped');
    expect(headerWithNote).toContain('<project_structure>');
    expect(headerWithNote).toContain('src/');

    const headerWithoutNote = generateHeader(nodes, false);
    expect(headerWithoutNote).not.toContain('Comments have been stripped');
  });
});
