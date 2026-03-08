import { describe, expect, it } from 'vitest';

import { DEFAULT_AGENT_TOOL_POLICY, isToolAllowed } from '@/lib/agent/policy';

describe('agent tool policy', () => {
  it('uses default allow-list policy', () => {
    expect(DEFAULT_AGENT_TOOL_POLICY.mode).toBe('allowList');
    expect(isToolAllowed('fs.read_file')).toBe(true);
    expect(isToolAllowed('fs.write_file')).toBe(false);
  });

  it('allowAll allows any tool', () => {
    expect(isToolAllowed('anything', { mode: 'allowAll', toolNames: [] })).toBe(true);
  });

  it('allowList only allows listed tools', () => {
    const policy = { mode: 'allowList' as const, toolNames: ['a', 'b'] };
    expect(isToolAllowed('a', policy)).toBe(true);
    expect(isToolAllowed('c', policy)).toBe(false);
  });

  it('denyList blocks listed tools and allows others', () => {
    const policy = { mode: 'denyList' as const, toolNames: ['danger'] };
    expect(isToolAllowed('danger', policy)).toBe(false);
    expect(isToolAllowed('safe', policy)).toBe(true);
  });

  it('returns false for unknown mode', () => {
    expect(isToolAllowed('x', { mode: 'unknown' as any, toolNames: [] })).toBe(false);
  });
});
