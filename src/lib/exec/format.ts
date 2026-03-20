import type { TFunction } from 'i18next';
import type { ExecSessionState } from '@/types/exec';

const EXEC_STATE_KEYS: Record<ExecSessionState, string> = {
  running: 'spotlight.toolRunning',
  completed: 'spotlight.toolCompleted',
  failed: 'spotlight.toolFailed',
  terminated: 'spotlight.execStateTerminated',
};

export function formatExecStateLabel(t: TFunction, state: ExecSessionState): string {
  return t(EXEC_STATE_KEYS[state]);
}
