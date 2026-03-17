import { describe, expect, it } from 'vitest';

import { cn, getPathLabel } from '@/lib/utils';

describe('getPathLabel', () => {
  it('extracts folder name from unix and windows paths', () => {
    expect(getPathLabel('/home/user/project')).toBe('project');
    expect(getPathLabel('C:\\Users\\Flynn\\CtxRun\\')).toBe('CtxRun');
  });

  it('handles empty and root-like paths', () => {
    expect(getPathLabel(undefined)).toBe('');
    expect(getPathLabel('')).toBe('');
    expect(getPathLabel('/')).toBe('/');
  });
});

describe('cn', () => {
  it('merges tailwind class conflicts', () => {
    expect(cn('px-2', 'px-4', false && 'hidden', 'text-sm')).toBe('px-4 text-sm');
  });
});
