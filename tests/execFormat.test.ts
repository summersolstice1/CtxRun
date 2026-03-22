import { describe, expect, it, vi } from 'vitest';
import { formatExecStateLabel } from '@/lib/exec/format';

describe('formatExecStateLabel', () => {
  it('maps execution states to translation keys', () => {
    const t = vi.fn((key: string) => key);

    expect(formatExecStateLabel(t, 'running')).toBe('spotlight.toolRunning');
    expect(formatExecStateLabel(t, 'completed')).toBe('spotlight.toolCompleted');
    expect(formatExecStateLabel(t, 'failed')).toBe('spotlight.toolFailed');
    expect(formatExecStateLabel(t, 'terminated')).toBe('spotlight.execStateTerminated');
  });
});
