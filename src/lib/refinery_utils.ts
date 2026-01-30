import { RefineryMetadata } from "@/types/refinery";

export function parseMetadata(jsonStr: string): RefineryMetadata {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return {};
  }
}

export function formatTimeAgo(timestamp: number, lang: 'zh' | 'en' = 'zh'): string {
  // 健壮性处理：如果时间戳是 0 或无效
  if (!timestamp || timestamp <= 0) return '-';

  // 健壮性处理：如果时间戳是秒级 (10位)，转为毫秒 (13位)
  let ms = timestamp;
  if (timestamp < 10000000000) {
      ms = timestamp * 1000;
  }

  const date = new Date(ms);
  if (isNaN(date.getTime())) return 'Invalid Date';

  const now = Date.now();
  const diff = now - ms;

  // 防止客户端时间误差导致出现 "负数时间"
  const safeDiff = Math.max(0, diff);

  const seconds = Math.floor(safeDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (lang === 'zh') {
    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  } else {
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US');
  }
}
