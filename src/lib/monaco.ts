import { getMonacoLanguage } from '@/lib/langs';

const KNOWN_MONACO_LANGUAGE_IDS = new Set([
  'plaintext',
  'javascript',
  'typescript',
  'json',
  'css',
  'scss',
  'sass',
  'less',
  'html',
  'xml',
  'rust',
  'python',
  'markdown',
  'yaml',
  'toml',
  'ini',
  'java',
  'kotlin',
  'scala',
  'groovy',
  'go',
  'c',
  'cpp',
  'csharp',
  'ruby',
  'php',
  'sql',
  'shell',
  'powershell',
  'dockerfile',
  'bat',
]);

let darkThemeDefined = false;

export function resolveMonacoPreviewLanguage(fileName: string, overrideLanguage?: string) {
  const normalizedOverride = overrideLanguage?.trim().toLowerCase();
  if (normalizedOverride) {
    if (KNOWN_MONACO_LANGUAGE_IDS.has(normalizedOverride)) {
      return normalizedOverride;
    }

    return getMonacoLanguage(`file.${normalizedOverride}`);
  }

  return getMonacoLanguage(fileName);
}

export function ensureMonacoThemes(monaco: any) {
  if (darkThemeDefined) {
    return;
  }

  monaco.editor.defineTheme('ctxrun-vs-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#121314',
      'editorGutter.background': '#121314',
      'minimap.background': '#121314',
      'editor.lineHighlightBackground': '#17191B',
      'editorWidget.background': '#181A1C',
      'editorWidget.border': '#2A2D31',
    },
  });

  darkThemeDefined = true;
}

export function getMonacoTheme(theme: string) {
  return theme === 'light' ? 'vs' : 'ctxrun-vs-dark';
}
