import { AppTheme } from '@/store/useAppStore';

export function applyThemeToDocument(theme: AppTheme): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark', 'black');

  if (theme === 'black') {
    root.classList.add('dark', 'black');
    return;
  }

  root.classList.add(theme);
}
