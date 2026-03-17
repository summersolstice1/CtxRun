import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Factory,
  FileJson,
  GitMerge,
  Globe,
  MousePointerClick,
} from 'lucide-react';

export const PRIMARY_APP_VIEWS = [
  'prompts',
  'context',
  'patch',
  'refinery',
  'automator',
  'miner',
] as const;

export type PrimaryAppView = (typeof PRIMARY_APP_VIEWS)[number];

interface AppNavigationItem {
  id: PrimaryAppView;
  hotkey: number;
  icon: LucideIcon;
  accentClass: string;
  accentColor: string;
}

export const APP_NAVIGATION_ITEMS: AppNavigationItem[] = [
  { id: 'prompts', hotkey: 1, icon: BookOpen, accentClass: 'text-pink-400', accentColor: '#f472b6' },
  { id: 'context', hotkey: 2, icon: FileJson, accentClass: 'text-sky-400', accentColor: '#38bdf8' },
  { id: 'patch', hotkey: 3, icon: GitMerge, accentClass: 'text-indigo-400', accentColor: '#818cf8' },
  { id: 'refinery', hotkey: 4, icon: Factory, accentClass: 'text-emerald-400', accentColor: '#34d399' },
  { id: 'automator', hotkey: 5, icon: MousePointerClick, accentClass: 'text-orange-400', accentColor: '#fb923c' },
  { id: 'miner', hotkey: 6, icon: Globe, accentClass: 'text-yellow-400', accentColor: '#facc15' },
];

export function isPrimaryAppView(view: string): view is PrimaryAppView {
  return PRIMARY_APP_VIEWS.includes(view as PrimaryAppView);
}

function getPrimaryViewIndex(view: PrimaryAppView): number {
  return PRIMARY_APP_VIEWS.indexOf(view);
}

export function getPrimaryViewByHotkey(hotkey: number): PrimaryAppView | null {
  return APP_NAVIGATION_ITEMS.find((item) => item.hotkey === hotkey)?.id ?? null;
}

export function getAdjacentPrimaryView(view: PrimaryAppView, delta: number): PrimaryAppView {
  const currentIndex = getPrimaryViewIndex(view);

  if (currentIndex < 0) {
    return PRIMARY_APP_VIEWS[0];
  }

  const total = PRIMARY_APP_VIEWS.length;
  const nextIndex = (currentIndex + (delta % total) + total) % total;
  return PRIMARY_APP_VIEWS[nextIndex];
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
  );
}
