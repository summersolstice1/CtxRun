import { ChatAttachment } from '@/types/spotlight';

export const CHAT_ATTACHMENT_LIMITS = {
  maxAttachments: 100,
  maxTotalBytes: 32 * 1024 * 1024,
  maxImageBytes: 5 * 1024 * 1024,
  maxTextFileBytes: 800 * 1024,
  maxTextChars: 30000,
} as const;

export const CHAT_ATTACHMENT_COLLAPSE_THRESHOLD = 12;

const IMAGE_MIME_SET = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
]);

const IMAGE_EXT_SET = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'svg',
]);

const CHAT_ATTACHMENT_TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml',
  'ini', 'cfg', 'conf', 'env',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'rs', 'go', 'java', 'kt', 'swift', 'php', 'rb', 'pl',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'sql',
  'html', 'css', 'scss', 'less', 'vue', 'svelte',
  'dockerfile', 'gitignore', 'gitattributes',
] as const;

const TEXT_EXT_SET = new Set<string>(CHAT_ATTACHMENT_TEXT_EXTENSIONS);

export const CHAT_ATTACHMENT_ACCEPT = [
  'image/*',
  ...CHAT_ATTACHMENT_TEXT_EXTENSIONS.map(ext => `.${ext}`),
].join(',');

const PARSE_YIELD_EVERY = 25;

interface ParseOptions {
  existingCount: number;
  existingBytes: number;
}

interface ParseAttachmentResult {
  items: ChatAttachment[];
  errors: ChatAttachmentError[];
}

export type ChatAttachmentError =
  | { type: 'too_many'; max: number }
  | { type: 'total_size_exceeded' }
  | { type: 'image_too_large'; fileName: string }
  | { type: 'file_too_large'; fileName: string }
  | { type: 'unsupported_type'; fileName: string }
  | { type: 'parse_failed'; fileName: string };

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  if (idx < 0 || idx === fileName.length - 1) return '';
  return fileName.slice(idx + 1).toLowerCase();
}

function canTreatAsText(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  if (file.type === 'application/json') return true;
  if (file.type === 'application/xml') return true;
  if (file.type === 'application/x-yaml') return true;
  if (file.type === 'application/javascript') return true;

  const ext = getExtension(file.name);
  return TEXT_EXT_SET.has(ext) || file.name.toLowerCase() === 'dockerfile';
}

function isImage(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (IMAGE_MIME_SET.has(mime)) return true;
  if (mime.startsWith('image/')) return true;

  const ext = getExtension(file.name);
  return IMAGE_EXT_SET.has(ext);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value === 'string') {
        resolve(value);
      } else {
        reject(new Error(`Failed to read ${file.name}`));
      }
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function toAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildTextContent(fileName: string, content: string, truncated: boolean): string {
  const suffix = truncated
    ? '\n\n[Truncated for safety. File is larger than allowed text length.]'
    : '';
  return `# File: ${fileName}\n\n${content}${suffix}`;
}

function yieldToMainThread(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

export async function parseChatAttachments(
  files: File[],
  options: ParseOptions
): Promise<ParseAttachmentResult> {
  const items: ChatAttachment[] = [];
  const errors: ChatAttachmentError[] = [];

  let count = options.existingCount;
  let totalBytes = options.existingBytes;
  let processed = 0;

  for (const file of files) {
    processed += 1;
    if (processed % PARSE_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }

    if (count >= CHAT_ATTACHMENT_LIMITS.maxAttachments) {
      errors.push({
        type: 'too_many',
        max: CHAT_ATTACHMENT_LIMITS.maxAttachments,
      });
      break;
    }

    if (totalBytes + file.size > CHAT_ATTACHMENT_LIMITS.maxTotalBytes) {
      errors.push({ type: 'total_size_exceeded' });
      continue;
    }

    try {
      if (isImage(file)) {
        if (file.size > CHAT_ATTACHMENT_LIMITS.maxImageBytes) {
          errors.push({ type: 'image_too_large', fileName: file.name });
          continue;
        }

        const dataUrl = await readAsDataUrl(file);
        items.push({
          id: toAttachmentId(),
          kind: 'image',
          name: file.name,
          mime: file.type || 'image/*',
          size: file.size,
          content: dataUrl,
        });
        count++;
        totalBytes += file.size;
        continue;
      }

      if (canTreatAsText(file)) {
        if (file.size > CHAT_ATTACHMENT_LIMITS.maxTextFileBytes) {
          errors.push({ type: 'file_too_large', fileName: file.name });
          continue;
        }

        const rawText = await file.text();
        const normalized = rawText.includes('\u0000')
          ? rawText.replace(/\u0000/g, '')
          : rawText;
        const truncated = normalized.length > CHAT_ATTACHMENT_LIMITS.maxTextChars;
        const content = truncated
          ? normalized.slice(0, CHAT_ATTACHMENT_LIMITS.maxTextChars)
          : normalized;

        items.push({
          id: toAttachmentId(),
          kind: 'file_text',
          name: file.name,
          mime: file.type || 'text/plain',
          size: file.size,
          content: buildTextContent(file.name, content, truncated),
          truncated,
        });
        count++;
        totalBytes += file.size;
        continue;
      }

      errors.push({ type: 'unsupported_type', fileName: file.name });
    } catch {
      errors.push({ type: 'parse_failed', fileName: file.name });
    }
  }

  return { items, errors };
}
