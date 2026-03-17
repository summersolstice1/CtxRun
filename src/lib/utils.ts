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
