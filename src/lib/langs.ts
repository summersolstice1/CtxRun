/**
 * 统一的语言映射配置
 * 用于文件扩展名到语言名称/颜色的映射
 */

interface LanguageInfo {
  name: string;
  color: string; // Tailwind CSS class
  monacoLanguage?: string; // Monaco Editor language identifier
}

// 文件扩展名到语言信息的映射
const LANGUAGE_MAP: Record<string, LanguageInfo> = {
  // TypeScript/JavaScript
  ts: { name: 'TypeScript', color: 'bg-blue-500', monacoLanguage: 'typescript' },
  tsx: { name: 'TypeScript JSX', color: 'bg-blue-400', monacoLanguage: 'typescript' },
  js: { name: 'JavaScript', color: 'bg-yellow-400', monacoLanguage: 'javascript' },
  jsx: { name: 'JavaScript JSX', color: 'bg-yellow-300', monacoLanguage: 'javascript' },
  mjs: { name: 'JavaScript', color: 'bg-yellow-400', monacoLanguage: 'javascript' },
  cjs: { name: 'JavaScript', color: 'bg-yellow-400', monacoLanguage: 'javascript' },

  // Styles & Markup
  json: { name: 'JSON', color: 'bg-gray-400', monacoLanguage: 'json' },
  css: { name: 'CSS', color: 'bg-sky-300', monacoLanguage: 'css' },
  scss: { name: 'SCSS', color: 'bg-pink-400', monacoLanguage: 'scss' },
  sass: { name: 'Sass', color: 'bg-pink-300', monacoLanguage: 'sass' },
  less: { name: 'Less', color: 'bg-pink-200', monacoLanguage: 'less' },
  html: { name: 'HTML', color: 'bg-orange-500', monacoLanguage: 'html' },
  htm: { name: 'HTML', color: 'bg-orange-500', monacoLanguage: 'html' },
  xml: { name: 'XML', color: 'bg-orange-400', monacoLanguage: 'xml' },

  // Rust
  rs: { name: 'Rust', color: 'bg-orange-700', monacoLanguage: 'rust' },

  // Python
  py: { name: 'Python', color: 'bg-blue-600', monacoLanguage: 'python' },
  pyi: { name: 'Python', color: 'bg-blue-600', monacoLanguage: 'python' },

  // Documentation
  md: { name: 'Markdown', color: 'bg-white', monacoLanguage: 'markdown' },
  markdown: { name: 'Markdown', color: 'bg-white', monacoLanguage: 'markdown' },

  // Config & Data
  yml: { name: 'YAML', color: 'bg-purple-400', monacoLanguage: 'yaml' },
  yaml: { name: 'YAML', color: 'bg-purple-400', monacoLanguage: 'yaml' },
  toml: { name: 'TOML', color: 'bg-purple-300', monacoLanguage: 'toml' },
  ini: { name: 'INI', color: 'bg-gray-300', monacoLanguage: 'ini' },

  // Java ecosystem
  java: { name: 'Java', color: 'bg-amber-600', monacoLanguage: 'java' },
  kt: { name: 'Kotlin', color: 'bg-purple-500', monacoLanguage: 'kotlin' },
  scala: { name: 'Scala', color: 'bg-red-500', monacoLanguage: 'scala' },
  groovy: { name: 'Groovy', color: 'bg-blue-400', monacoLanguage: 'groovy' },

  // Go ecosystem
  go: { name: 'Go', color: 'bg-cyan-500', monacoLanguage: 'go' },

  // C/C++ ecosystem
  c: { name: 'C', color: 'bg-blue-800', monacoLanguage: 'c' },
  cpp: { name: 'C++', color: 'bg-blue-700', monacoLanguage: 'cpp' },
  cc: { name: 'C++', color: 'bg-blue-700', monacoLanguage: 'cpp' },
  cxx: { name: 'C++', color: 'bg-blue-700', monacoLanguage: 'cpp' },
  h: { name: 'C/C++ Header', color: 'bg-blue-900', monacoLanguage: 'c' },
  hpp: { name: 'C++ Header', color: 'bg-blue-900', monacoLanguage: 'cpp' },
  hxx: { name: 'C++ Header', color: 'bg-blue-900', monacoLanguage: 'cpp' },

  // C# ecosystem
  cs: { name: 'C#', color: 'bg-purple-600', monacoLanguage: 'csharp' },

  // Ruby ecosystem
  rb: { name: 'Ruby', color: 'bg-red-600', monacoLanguage: 'ruby' },

  // PHP ecosystem
  php: { name: 'PHP', color: 'bg-indigo-500', monacoLanguage: 'php' },

  // SQL
  sql: { name: 'SQL', color: 'bg-pink-500', monacoLanguage: 'sql' },

  // Shell & Scripts
  sh: { name: 'Shell', color: 'bg-green-600', monacoLanguage: 'shell' },
  bash: { name: 'Bash', color: 'bg-green-500', monacoLanguage: 'shell' },
  zsh: { name: 'Zsh', color: 'bg-green-400', monacoLanguage: 'shell' },
  fish: { name: 'Fish', color: 'bg-orange-400', monacoLanguage: 'shell' },
  ps1: { name: 'PowerShell', color: 'bg-blue-600', monacoLanguage: 'powershell' },

  // Other
  txt: { name: 'Plain Text', color: 'bg-gray-400', monacoLanguage: 'plaintext' },
  lock: { name: 'Lock File', color: 'bg-gray-500', monacoLanguage: 'plaintext' },
  gitignore: { name: 'Git Ignore', color: 'bg-orange-600', monacoLanguage: 'plaintext' },
  dockerfile: { name: 'Dockerfile', color: 'bg-blue-500', monacoLanguage: 'dockerfile' },
};

/**
 * 从文件路径获取语言信息
 * @param filePath 文件路径
 * @returns 语言信息，未找到返回默认值
 */
export function getLanguageInfo(filePath: string): LanguageInfo {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_MAP[ext] || { name: 'Unknown', color: 'bg-gray-300', monacoLanguage: 'plaintext' };
}

/**
 * 从文件路径获取 Monaco Editor 的语言标识符
 * @param filePath 文件路径
 * @returns Monaco 语言标识符
 */
export function getMonacoLanguage(filePath: string): string {
  return getLanguageInfo(filePath).monacoLanguage || 'plaintext';
}
