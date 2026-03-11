import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getPathLabel(path: string | null | undefined): string {
  if (!path) return '';

  const normalized = path.replace(/[\\/]+$/, '');
  if (!normalized) return path;

  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || normalized;
}

export function stripMarkdown(markdown: string): string {
  if (!markdown) return '';

  return markdown
    .replace(/```[\w-]*\n([\s\S]*?)\n```/g, '$1')
    .replace(/```([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^>\s+/gm, '')
    .replace(/^(-{3,}|(\*{3,}))$/gm, '')
    .trim();
}
