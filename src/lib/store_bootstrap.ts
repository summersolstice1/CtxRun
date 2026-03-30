import { useAppStore } from '@/store/useAppStore';
import { useAutomatorStore } from '@/store/useAutomatorStore';
import { useContextStore } from '@/store/useContextStore';
import { useMinerStore } from '@/store/useMinerStore';
import { usePromptStore } from '@/store/usePromptStore';

let fullHydrationPromise: Promise<void> | null = null;
let peekHydrationPromise: Promise<void> | null = null;
let guardHydrationPromise: Promise<void> | null = null;

function hydrateAllStores(): Promise<void> {
  if (!fullHydrationPromise) {
    fullHydrationPromise = Promise.all([
      useAppStore.persist.rehydrate(),
      useContextStore.persist.rehydrate(),
      usePromptStore.persist.rehydrate(),
      useAutomatorStore.persist.rehydrate(),
      useMinerStore.persist.rehydrate(),
    ]).then(() => undefined);
  }

  return fullHydrationPromise;
}

function hydratePeekStores(): Promise<void> {
  if (!peekHydrationPromise) {
    peekHydrationPromise = Promise.resolve(useAppStore.persist.rehydrate()).then(() => undefined);
  }

  return peekHydrationPromise;
}

function hydrateGuardStores(): Promise<void> {
  if (!guardHydrationPromise) {
    guardHydrationPromise = Promise.resolve(useAppStore.persist.rehydrate()).then(() => undefined);
  }

  return guardHydrationPromise;
}

export function hydratePersistedStores(windowLabel?: string): Promise<void> {
  if (windowLabel === 'peek') {
    return hydratePeekStores();
  }

  if (windowLabel === 'guard') {
    return hydrateGuardStores();
  }

  return hydrateAllStores();
}
