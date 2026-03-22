import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExecApprovalStore } from '@/store/useExecApprovalStore';

describe('useExecApprovalStore', () => {
  beforeEach(() => {
    useExecApprovalStore.setState({
      pending: undefined,
      sessionAllowedCommands: [],
      prefixAllowedRules: [],
      resolver: undefined,
    });
  });

  it('stores pending approvals and updates allow lists when resolved', async () => {
    const first = useExecApprovalStore.getState().ask({
      toolCallId: 'tool-3',
      request: { command: 'npm run build', workspaceRoot: '/repo' },
      approval: {
        reason: 'r',
        risk: 'medium',
        workdir: '/repo',
        parsedCommands: [],
        prefixRule: ['npm run'],
      },
    });

    expect(useExecApprovalStore.getState().pending?.toolCallId).toBe('tool-3');
    useExecApprovalStore.getState().resolve('session');
    await expect(first).resolves.toBe('session');
    expect(useExecApprovalStore.getState().sessionAllowedCommands).toContain('npm run build');
    expect(useExecApprovalStore.getState().pending).toBeUndefined();

    const second = useExecApprovalStore.getState().ask({
      toolCallId: 'tool-4',
      request: { command: 'git log --stat', workspaceRoot: '/repo' },
      approval: {
        reason: 'r',
        risk: 'medium',
        workdir: '/repo',
        parsedCommands: [],
        prefixRule: ['Git Log'],
      },
    });

    expect(useExecApprovalStore.getState().pending?.toolCallId).toBe('tool-4');
    useExecApprovalStore.getState().resolve('prefix_rule');
    await expect(second).resolves.toBe('prefix_rule');
    expect(useExecApprovalStore.getState().prefixAllowedRules).toContain('git log');
    expect(useExecApprovalStore.getState().pending).toBeUndefined();

    const third = useExecApprovalStore.getState().ask({
      toolCallId: 'tool-5',
      request: { command: 'rm -rf /', workspaceRoot: '/repo' },
      approval: {
        reason: 'r',
        risk: 'high',
        workdir: '/repo',
        parsedCommands: [],
      },
    });

    useExecApprovalStore.getState().resolve({ decision: 'reject', note: 'No destructive commands' });
    await expect(third).resolves.toEqual({
      decision: 'reject',
      note: 'No destructive commands',
    });
    expect(useExecApprovalStore.getState().pending).toBeUndefined();
  });
});
