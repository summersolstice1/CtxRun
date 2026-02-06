import { RefineryItemUI } from "@/types/refinery";

export type FeedItemType =
  | { type: 'single'; item: RefineryItemUI }
  | { type: 'bundle'; id: string; items: RefineryItemUI[]; sourceApp: string; timestamp: number };

// 设定分组阈值：连续 2 分钟内的同来源内容
const BUNDLE_THRESHOLD_MS = 2 * 60 * 1000;

export function bundleItems(items: RefineryItemUI[]): FeedItemType[] {
  if (items.length === 0) return [];

  const result: FeedItemType[] = [];
  let currentBundle: RefineryItemUI[] = [];

  // items 已经是按时间倒序排列的 (最新的在 index 0)
  for (let i = 0; i < items.length; i++) {
    const current = items[i];

    // 1. 排除条件：置顶项、手动笔记、或者已被编辑过的项
    // 这些项通常具有独立价值，不应该被自动折叠
    if (current.isPinned || current.isManual) {
      if (currentBundle.length > 0) {
        result.push(finalizeBundle(currentBundle));
        currentBundle = [];
      }
      result.push({ type: 'single', item: current });
      continue;
    }

    // 2. 尝试加入当前 Bundle
    if (currentBundle.length > 0) {
      const latestInBundle = currentBundle[currentBundle.length - 1]; // 实际上是时间轴上紧邻的前一项

      const timeDiff = Math.abs(latestInBundle.updatedAt - current.updatedAt);
      const sameSource = (latestInBundle.sourceApp || 'Unknown') === (current.sourceApp || 'Unknown');
      const sameKind = latestInBundle.kind === current.kind; // 可选：只有同类型才折叠，视觉更统一

      if (sameSource && sameKind && timeDiff < BUNDLE_THRESHOLD_MS) {
        currentBundle.push(current);
      } else {
        // 结算旧的，开始新的
        result.push(finalizeBundle(currentBundle));
        currentBundle = [current];
      }
    } else {
      currentBundle = [current];
    }
  }

  // 结算剩余的
  if (currentBundle.length > 0) {
    result.push(finalizeBundle(currentBundle));
  }

  return result;
}

function finalizeBundle(items: RefineryItemUI[]): FeedItemType {
  // 如果只有一个，不需要折叠
  if (items.length === 1) {
    return { type: 'single', item: items[0] };
  }
  // 注意：items[0] 是该组中最新的
  return {
    type: 'bundle',
    id: `bundle-${items[0].id}`,
    items: items,
    sourceApp: items[0].sourceApp || 'Unknown',
    timestamp: items[0].updatedAt
  };
}
