import { describe, expect, it } from 'vitest';

import { calculateIdealTreeWidth, flattenTree } from '@/lib/tree_utils';
import { FileNode } from '@/types/context';

function fileNode(id: string, name: string, children?: FileNode[]): FileNode {
  return {
    id,
    name,
    path: `/${name}`,
    kind: children ? 'dir' : 'file',
    isSelected: true,
    children,
  };
}

describe('tree utils', () => {
  it('calculateIdealTreeWidth respects minimum width', () => {
    expect(calculateIdealTreeWidth([])).toBe(150);
    expect(calculateIdealTreeWidth([fileNode('a', 'x')])).toBe(150);
  });

  it('calculateIdealTreeWidth caps to max width', () => {
    const deep = fileNode(
      'root',
      'root',
      [fileNode('child', 'a'.repeat(80), [fileNode('leaf', 'b'.repeat(80))])]
    );
    expect(calculateIdealTreeWidth([deep])).toBe(380);
  });

  it('flattenTree only expands children for expanded ids', () => {
    const tree = [
      fileNode('root', 'root', [
        fileNode('f1', 'a.ts'),
        fileNode('nested', 'nested', [fileNode('f2', 'b.ts')]),
      ]),
    ];

    const collapsed = flattenTree(tree, []);
    expect(collapsed.map((x) => x.node.id)).toEqual(['root']);

    const expanded = flattenTree(tree, ['root', 'nested']);
    expect(expanded.map((x) => x.node.id)).toEqual(['root', 'f1', 'nested', 'f2']);
    expect(expanded.find((x) => x.node.id === 'nested')?.depth).toBe(1);
    expect(expanded.find((x) => x.node.id === 'f2')?.depth).toBe(2);
  });

  it('flattenTree derives checked and partial display state from descendants', () => {
    const tree: FileNode[] = [
      {
        id: 'root',
        name: 'root',
        path: '/root',
        kind: 'dir',
        isSelected: false,
        children: [
          {
            id: 'checked-dir',
            name: 'checked-dir',
            path: '/root/checked-dir',
            kind: 'dir',
            isSelected: false,
            children: [fileNode('checked-leaf', 'checked.ts')],
          },
          {
            id: 'mixed-dir',
            name: 'mixed-dir',
            path: '/root/mixed-dir',
            kind: 'dir',
            isSelected: false,
            children: [
              fileNode('mixed-on', 'mixed-on.ts'),
              { ...fileNode('mixed-off', 'mixed-off.ts'), isSelected: false },
            ],
          },
        ],
      },
    ];

    const flat = flattenTree(tree, ['root', 'checked-dir', 'mixed-dir']);

    expect(flat.find((x) => x.node.id === 'checked-dir')).toMatchObject({
      displaySelected: true,
      displayPartial: false,
    });
    expect(flat.find((x) => x.node.id === 'mixed-dir')).toMatchObject({
      displaySelected: false,
      displayPartial: true,
    });
    expect(flat.find((x) => x.node.id === 'root')).toMatchObject({
      displaySelected: false,
      displayPartial: true,
    });
  });
});
