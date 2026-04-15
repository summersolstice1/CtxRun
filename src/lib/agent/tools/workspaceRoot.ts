import { useAppStore } from '@/store/useAppStore';
import { useContextStore } from '@/store/useContextStore';

export function getWorkspaceRoot(): string {
  const appRoot = useAppStore.getState().projectRoot?.trim();
  if (appRoot) {
    return appRoot;
  }

  const contextRoot = useContextStore.getState().projectRoot?.trim();
  if (contextRoot) {
    return contextRoot;
  }

  throw new Error('projectRoot is not configured. Please select a workspace folder first.');
}
