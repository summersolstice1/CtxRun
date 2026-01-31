import { RefineryMetadata } from "@/types/refinery";

export function parseMetadata(jsonStr: string): RefineryMetadata {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return {};
  }
}

export function formatTimeAgo(timestamp: number | string, lang?: string): string {
  // 健壮性处理：如果时间戳是 0 或无效
  if (timestamp === null || timestamp === undefined) return '-';
  if (typeof timestamp === 'string' && timestamp === '') return '-';

  // 健壮性处理：如果时间戳是字符串，转为数字
  let ts: number;
  if (typeof timestamp === 'string') {
    ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return '-';
  } else if (typeof timestamp === 'number') {
    ts = timestamp;
  } else {
    return '-';
  }

  if (ts <= 0) return '-';

  // 健壮性处理：如果时间戳是秒级 (10位)，转为毫秒 (13位)
  let ms = ts;
  if (ts < 10000000000) {
      ms = ts * 1000;
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

  // 健壮性处理：lang 可能是 undefined 或其他类型
  const effectiveLang = lang === 'zh' || lang === 'en' ? lang : 'zh';

  if (effectiveLang === 'zh') {
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
