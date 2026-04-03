import type { SpotlightAppearance } from '@/store/useAppStore';
import type { SpotlightMode } from '@/types/spotlight';

export const DEFAULT_SPOTLIGHT_APPEARANCE: SpotlightAppearance = {
  width: 640,
  defaultHeight: 400,
  maxChatHeight: 600,
};

export const SPOTLIGHT_RESIZE_LIMITS = {
  width: { min: 500, max: 1000 },
  defaultHeight: { min: 150, max: 800 },
  maxChatHeight: { min: 400, max: 900 },
} as const;

export const SPOTLIGHT_RESIZE_STEP = 20;
export const SPOTLIGHT_RESIZE_FAST_STEP = 60;

export type ResizeDirection = 'up' | 'down' | 'left' | 'right';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function areSpotlightAppearancesEqual(
  left: SpotlightAppearance,
  right: SpotlightAppearance,
): boolean {
  return (
    left.width === right.width &&
    left.defaultHeight === right.defaultHeight &&
    left.maxChatHeight === right.maxChatHeight
  );
}

export function normalizeSpotlightAppearance(
  appearance: SpotlightAppearance,
): SpotlightAppearance {
  const width = clamp(
    appearance.width,
    SPOTLIGHT_RESIZE_LIMITS.width.min,
    SPOTLIGHT_RESIZE_LIMITS.width.max,
  );
  const defaultHeight = clamp(
    appearance.defaultHeight,
    SPOTLIGHT_RESIZE_LIMITS.defaultHeight.min,
    SPOTLIGHT_RESIZE_LIMITS.defaultHeight.max,
  );
  const maxChatHeight = clamp(
    Math.max(appearance.maxChatHeight, defaultHeight),
    Math.max(SPOTLIGHT_RESIZE_LIMITS.maxChatHeight.min, defaultHeight),
    SPOTLIGHT_RESIZE_LIMITS.maxChatHeight.max,
  );

  return { width, defaultHeight, maxChatHeight };
}

export function getSpotlightWindowHeight(
  appearance: SpotlightAppearance,
  mode: SpotlightMode,
  hasChatMessages: boolean,
): number {
  const normalized = normalizeSpotlightAppearance(appearance);
  return mode === 'chat' && hasChatMessages
    ? normalized.maxChatHeight
    : normalized.defaultHeight;
}

export function applyResizeDelta(
  appearance: SpotlightAppearance,
  direction: ResizeDirection,
  mode: SpotlightMode,
  hasChatMessages: boolean,
  step: number,
): SpotlightAppearance {
  const normalized = normalizeSpotlightAppearance(appearance);
  const delta = direction === 'up' || direction === 'left' ? -step : step;

  if (direction === 'left' || direction === 'right') {
    return normalizeSpotlightAppearance({
      ...normalized,
      width: normalized.width + delta,
    });
  }

  const targetKey =
    mode === 'chat' && hasChatMessages ? 'maxChatHeight' : 'defaultHeight';

  return normalizeSpotlightAppearance({
    ...normalized,
    [targetKey]: normalized[targetKey] + delta,
  });
}

export function formatSpotlightSizeLabel(width: number, height: number): string {
  return `${width} x ${height}`;
}
