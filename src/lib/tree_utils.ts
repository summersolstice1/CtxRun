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
  displaySelected: boolean;
  displayPartial: boolean;
}

interface SelectionSummary {
  allSelected: boolean;
  anySelected: boolean;
  hasSelectable: boolean;
}

function buildSelectionStateMap(nodes: FileNode[]) {
  const selectionMap = new Map<string, { displaySelected: boolean; displayPartial: boolean }>();

  const summarizeNode = (node: FileNode): SelectionSummary => {
    if (node.isLocked) {
      selectionMap.set(node.id, { displaySelected: false, displayPartial: false });
      return {
        allSelected: true,
        anySelected: false,
        hasSelectable: false,
      };
    }

    if (!node.children || node.children.length === 0) {
      const selected = !!node.isSelected;
      selectionMap.set(node.id, { displaySelected: selected, displayPartial: false });
      return {
        allSelected: selected,
        anySelected: selected,
        hasSelectable: true,
      };
    }

    const childSummaries = node.children.map(summarizeNode);
    const relevantChildren = childSummaries.filter((summary) => summary.hasSelectable);

    if (relevantChildren.length === 0) {
      const selected = !!node.isSelected;
      selectionMap.set(node.id, { displaySelected: selected, displayPartial: false });
      return {
        allSelected: selected,
        anySelected: selected,
        hasSelectable: true,
      };
    }

    const allSelected = relevantChildren.every((summary) => summary.allSelected);
    const anySelected = relevantChildren.some((summary) => summary.anySelected);

    selectionMap.set(node.id, {
      displaySelected: allSelected,
      displayPartial: anySelected && !allSelected,
    });

    return {
      allSelected,
      anySelected,
      hasSelectable: true,
    };
  };

  nodes.forEach(summarizeNode);
  return selectionMap;
}

// 高性能扁平化函数
export function flattenTree(
  nodes: FileNode[],
  expandedIds: string[],
  depth = 0
): FlatNode[] {
  const expandedSet = new Set(expandedIds);
  const selectionMap = buildSelectionStateMap(nodes);
  let flatList: FlatNode[] = [];

  const traverse = (list: FileNode[], currentDepth: number) => {
    for (const node of list) {
      const isExpanded = expandedSet.has(node.id);
      const hasChildren = !!(node.children && node.children.length > 0);
      const selectionState = selectionMap.get(node.id) ?? {
        displaySelected: !!node.isSelected,
        displayPartial: false,
      };

      flatList.push({
        node,
        depth: currentDepth,
        hasChildren,
        isExpanded,
        displaySelected: selectionState.displaySelected,
        displayPartial: selectionState.displayPartial,
      });

      if (hasChildren && isExpanded && node.children) {
        traverse(node.children, currentDepth + 1);
      }
    }
  };

  traverse(nodes, depth);
  return flatList;
}
