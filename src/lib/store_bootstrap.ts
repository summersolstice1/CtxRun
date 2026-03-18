import { useAppStore } from '@/store/useAppStore';
import { useAutomatorStore } from '@/store/useAutomatorStore';
import { useContextStore } from '@/store/useContextStore';
import { useMinerStore } from '@/store/useMinerStore';
import { usePromptStore } from '@/store/usePromptStore';

let hydrationPromise: Promise<void> | null = null;

export function hydratePersistedStores(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = Promise.all([
      useAppStore.persist.rehydrate(),
      useContextStore.persist.rehydrate(),
      usePromptStore.persist.rehydrate(),
      useAutomatorStore.persist.rehydrate(),
      useMinerStore.persist.rehydrate(),
    ]).then(() => undefined);
  }

  return hydrationPromise;
}
