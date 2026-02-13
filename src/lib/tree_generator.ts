import { FileNode } from '@/types/context';

export function generateAsciiTree(nodes: FileNode[]): string {
  let output = '';

  const traverse = (nodeList: FileNode[], prefix: string) => {
    const activeNodes = nodeList.filter(n => n.isSelected);

    activeNodes.forEach((node, index) => {
      const isLast = index === activeNodes.length - 1;

      const connector = isLast ? '└── ' : '├── ';
      output += `${prefix}${connector}${node.name}${node.kind === 'dir' ? '/' : ''}\n`;

      if (node.children && node.children.length > 0) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        traverse(node.children, childPrefix);
      }
    });
  };

  traverse(nodes, '');

  if (!output.trim()) return '(No files selected)';
  return output;
}