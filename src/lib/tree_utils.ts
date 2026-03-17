import { FileNode } from "@/types/context";

// 配置常量
const INDENT_PER_LEVEL = 16; // 对应 FileTreeNode 中的 level * 16
const CHAR_WIDTH_APPROX = 7.5; // 估计每个字符的像素宽度 (等宽或普通字体平均值)
const BASE_PADDING = 60; // 图标、Checkbox、右侧滚动条预留空间
const MAX_AUTO_WIDTH = 380; // 自动调整的上限
const MIN_WIDTH = 150; // 最小宽度

/**
 * 计算文件树的推荐宽度
 * @param nodes 文件节点列表
 * @returns 推荐的像素宽度
 */
export function calculateIdealTreeWidth(nodes: FileNode[]): number {
  let maxPixelWidth = 0;

  const traverse = (list: FileNode[], level: number) => {
    list.forEach(node => {
      const currentWidth = (level * INDENT_PER_LEVEL) + (node.name.length * CHAR_WIDTH_APPROX) + BASE_PADDING;

      if (currentWidth > maxPixelWidth) {
        maxPixelWidth = currentWidth;
      }

      if (node.children && node.children.length > 0) {
        traverse(node.children, level + 1);
      }
    });
  };

  traverse(nodes, 0);

  return Math.max(MIN_WIDTH, Math.min(maxPixelWidth, MAX_AUTO_WIDTH));
}

// 扁平化节点接口
interface FlatNode {
  node: FileNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

// 高性能扁平化函数
export function flattenTree(
  nodes: FileNode[],
  expandedIds: string[],
  depth = 0
): FlatNode[] {
  const expandedSet = new Set(expandedIds);
  let flatList: FlatNode[] = [];

  const traverse = (list: FileNode[], currentDepth: number) => {
    for (const node of list) {
      const isExpanded = expandedSet.has(node.id);
      const hasChildren = !!(node.children && node.children.length > 0);

      flatList.push({
        node,
        depth: currentDepth,
        hasChildren,
        isExpanded
      });

      if (hasChildren && isExpanded && node.children) {
        traverse(node.children, currentDepth + 1);
      }
    }
  };

  traverse(nodes, depth);
  return flatList;
}
