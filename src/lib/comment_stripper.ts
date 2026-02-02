import strip from 'strip-comments';

export function stripSourceComments(content: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  let langType = '';

  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'json':
    case 'jsonc':
    case 'java':
    case 'c':
    case 'cpp':
    case 'h':
    case 'cs':
    case 'go':
    case 'rs':
    case 'swift':
    case 'kt':
    case 'scala':
    case 'dart':
      langType = 'js';
      break;

    case 'py':
    case 'rb':
    case 'pl':
    case 'sh':
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'dockerfile':
    case 'conf':
      langType = 'python';
      break;

    case 'html':
    case 'xml':
    case 'vue':
    case 'svelte':
    case 'svg':
      langType = 'html';
      break;

    case 'css':
    case 'scss':
    case 'less':
      langType = 'css';
      break;

    case 'php':
      langType = 'php';
      break;

    case 'sql':
      langType = 'sql';
      break;

    default:
      return content;
  }

  try {
    return strip(content, { language: langType, preserveNewlines: false });
  } catch (e) {
    return content;
  }
}
