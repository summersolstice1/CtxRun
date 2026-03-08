import { describe, expect, it, vi } from 'vitest';

type ConfirmStore = typeof import('@/store/useConfirmStore')['useConfirmStore'];

async function importFreshConfirmStore(): Promise<ConfirmStore> {
  vi.resetModules();
  const mod = await import('@/store/useConfirmStore');
  return mod.useConfirmStore;
}

describe('useConfirmStore', () => {
  it('ask opens dialog with default labels and type', async () => {
    const useConfirmStore = await importFreshConfirmStore();

    const pending = useConfirmStore.getState().ask({
      title: 'Delete item',
      message: 'Are you sure?',
    });

    const state = useConfirmStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.options.title).toBe('Delete item');
    expect(state.options.confirmText).toBe('Confirm');
    expect(state.options.cancelText).toBe('Cancel');
    expect(state.options.type).toBe('warning');

    useConfirmStore.getState().handleCancel();
    await expect(pending).resolves.toBe(false);
  });

  it('handleConfirm resolves pending ask as true and closes dialog', async () => {
    const useConfirmStore = await importFreshConfirmStore();

    const pending = useConfirmStore.getState().ask({
      title: 'Proceed',
      message: 'Continue?',
      type: 'info',
    });

    useConfirmStore.getState().handleConfirm();

    await expect(pending).resolves.toBe(true);
    expect(useConfirmStore.getState().isOpen).toBe(false);
    expect(useConfirmStore.getState().resolve).toBeUndefined();
  });

  it('handleCancel resolves pending ask as false and closes dialog', async () => {
    const useConfirmStore = await importFreshConfirmStore();

    const pending = useConfirmStore.getState().ask({
      title: 'Cancel flow',
      message: 'Abort?',
      confirmText: 'Yes',
      cancelText: 'No',
      type: 'danger',
    });

    useConfirmStore.getState().handleCancel();

    await expect(pending).resolves.toBe(false);
    expect(useConfirmStore.getState().isOpen).toBe(false);
    expect(useConfirmStore.getState().resolve).toBeUndefined();
  });
});
