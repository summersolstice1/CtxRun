import { RefineryMetadata } from "@/types/refinery";
import i18n from "@/i18n/config";

export function parseMetadata(jsonStr: string): RefineryMetadata {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return {};
  }
}

export function formatTimeAgo(timestamp: number | string, _lang?: string): string {
  if (timestamp === null || timestamp === undefined) return '-';
  if (typeof timestamp === 'string' && timestamp === '') return '-';

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

  let ms = ts;
  if (ts < 10000000000) {
      ms = ts * 1000;
  }

  const date = new Date(ms);
  if (isNaN(date.getTime())) return 'Invalid Date';

  const now = Date.now();
  const diff = now - ms;

  const safeDiff = Math.max(0, diff);

  const seconds = Math.floor(safeDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return i18n.t('common.justNow');
  if (minutes < 60) return i18n.t('common.minutesAgo', { count: minutes });
  if (hours < 24) return i18n.t('common.hoursAgo', { count: hours });
  if (days < 7) return i18n.t('common.daysAgo', { count: days });
  return date.toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US');
}
