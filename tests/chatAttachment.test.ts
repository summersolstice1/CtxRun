import { describe, expect, it } from 'vitest';

import {
  CHAT_ATTACHMENT_LIMITS,
  parseChatAttachments,
} from '@/lib/chat_attachment';

describe('parseChatAttachments', () => {
  it('parses text attachments into file_text entries', async () => {
    const file = new File(['const a = 1;'], 'a.ts', { type: 'text/plain' });
    const result = await parseChatAttachments([file], {
      existingCount: 0,
      existingBytes: 0,
    });

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe('file_text');
    expect(result.items[0].name).toBe('a.ts');
    expect(result.items[0].content).toContain('# File: a.ts');
    expect(result.items[0].content).toContain('const a = 1;');
  });

  it('parses image attachments into data-url entries', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'image.png', {
      type: 'image/png',
    });
    const result = await parseChatAttachments([file], {
      existingCount: 0,
      existingBytes: 0,
    });

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe('image');
    expect(result.items[0].content.startsWith('data:image/png')).toBe(true);
  });

  it('rejects unsupported file types', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'binary.bin', {
      type: 'application/octet-stream',
    });
    const result = await parseChatAttachments([file], {
      existingCount: 0,
      existingBytes: 0,
    });

    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([{ type: 'unsupported_type', fileName: 'binary.bin' }]);
  });

  it('returns too_many when count limit reached', async () => {
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    const result = await parseChatAttachments([file], {
      existingCount: CHAT_ATTACHMENT_LIMITS.maxAttachments,
      existingBytes: 0,
    });

    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([
      { type: 'too_many', max: CHAT_ATTACHMENT_LIMITS.maxAttachments },
    ]);
  });

  it('returns total_size_exceeded when cumulative bytes exceed limit', async () => {
    const file = new File(['12'], 'a.txt', { type: 'text/plain' });
    const result = await parseChatAttachments([file], {
      existingCount: 0,
      existingBytes: CHAT_ATTACHMENT_LIMITS.maxTotalBytes - 1,
    });

    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([{ type: 'total_size_exceeded' }]);
  });

  it('marks text attachments as truncated when content exceeds char limit', async () => {
    const content = 'a'.repeat(CHAT_ATTACHMENT_LIMITS.maxTextChars + 10);
    const file = new File([content], 'large.txt', { type: 'text/plain' });
    const result = await parseChatAttachments([file], {
      existingCount: 0,
      existingBytes: 0,
    });

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe('file_text');
    expect(result.items[0].truncated).toBe(true);
    expect(result.items[0].content).toContain('Truncated for safety');
  });

  it('rejects oversized images with image_too_large', async () => {
    const hugeImage = new File(
      [new Uint8Array(CHAT_ATTACHMENT_LIMITS.maxImageBytes + 1)],
      'huge.png',
      { type: 'image/png' }
    );
    const result = await parseChatAttachments([hugeImage], {
      existingCount: 0,
      existingBytes: 0,
    });

    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([{ type: 'image_too_large', fileName: 'huge.png' }]);
  });
});
