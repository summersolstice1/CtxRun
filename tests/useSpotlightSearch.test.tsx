import React from 'react';
import { act } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock, appStoreSnapshot } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  appStoreSnapshot: {
    searchSettings: {
      defaultEngine: 'google' as const,
      customUrl: 'https://example.com/search?q=%s',
    },
    language: 'en' as const,
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: () => appStoreSnapshot,
}));

import { SpotlightProvider, useSpotlight } from '@/components/features/spotlight/core/SpotlightContext';
import { useSpotlightSearch } from '@/components/features/spotlight/hooks/useSpotlightSearch';

function makePrompt(id: string, title: string) {
  return {
    id,
    title,
    content: `${title}-content`,
    group: 'Default',
    description: `${title}-desc`,
    tags: [],
    isFavorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: 'local',
    type: 'prompt',
    isExecutable: false,
    shellType: 'auto',
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let latestSpotlight:
  | ReturnType<typeof useSpotlight>
  | null = null;
let latestSearch:
  | ReturnType<typeof useSpotlightSearch>
  | null = null;

async function flushDebounce(ms = 160) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await Promise.resolve();
  });
}

function Harness() {
  const spotlight = useSpotlight();
  const search = useSpotlightSearch((key) => key as string);
  latestSpotlight = spotlight;
  latestSearch = search;
  return null;
}

describe('useSpotlightSearch race handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    latestSpotlight = null;
    latestSearch = null;
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('keeps newest query results when older search resolves later', async () => {
    const first = deferred<any[]>();
    const second = deferred<any[]>();

    invokeMock.mockImplementation((command: string, args: any) => {
      if (command === 'search_prompts') {
        if (args.query === 'first') {
          return first.promise;
        }
        if (args.query === 'second') {
          return second.promise;
        }
      }
      if (command === 'search_url_history' || command === 'search_apps_in_db') {
        return Promise.resolve([]);
      }
      if (command === 'get_prompts') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(
      <SpotlightProvider>
        <Harness />
      </SpotlightProvider>
    );

    expect(latestSpotlight).not.toBeNull();
    expect(latestSearch).not.toBeNull();

    act(() => {
      latestSpotlight!.setQuery('first');
    });
    await flushDebounce();

    expect(invokeMock).toHaveBeenCalledWith(
      'search_prompts',
      expect.objectContaining({ query: 'first' })
    );

    act(() => {
      latestSpotlight!.setQuery('second');
    });
    await flushDebounce();

    expect(invokeMock).toHaveBeenCalledWith(
      'search_prompts',
      expect.objectContaining({ query: 'second' })
    );

    second.resolve([makePrompt('prompt-2', 'Second Prompt')]);
    await act(async () => {
      await second.promise;
      await Promise.resolve();
    });

    expect(latestSearch!.results.map((item) => item.id)).toEqual(['prompt-2']);

    first.resolve([makePrompt('prompt-1', 'First Prompt')]);
    await act(async () => {
      await first.promise;
      await Promise.resolve();
    });

    expect(latestSearch!.results.map((item) => item.id)).toEqual(['prompt-2']);

  });

  it('keeps newest clipboard results when older clipboard search resolves later', async () => {
    const oldClipboard = deferred<any[]>();
    const newClipboard = deferred<any[]>();

    invokeMock.mockImplementation((command: string, args: any) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_history') {
        if (args.searchQuery === 'old-clip') {
          return oldClipboard.promise;
        }
        if (args.searchQuery === 'new-clip') {
          return newClipboard.promise;
        }
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(
      <SpotlightProvider>
        <Harness />
      </SpotlightProvider>
    );

    expect(latestSpotlight).not.toBeNull();
    expect(latestSearch).not.toBeNull();

    act(() => {
      latestSpotlight!.setMode('clipboard');
    });
    await flushDebounce(130);

    act(() => {
      latestSpotlight!.setQuery('old-clip');
    });
    await flushDebounce();

    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_history',
      expect.objectContaining({ searchQuery: 'old-clip' })
    );

    act(() => {
      latestSpotlight!.setQuery('new-clip');
    });
    await flushDebounce();

    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_history',
      expect.objectContaining({ searchQuery: 'new-clip' })
    );

    newClipboard.resolve([
      {
        id: 'clip-new',
        kind: 'text',
        title: 'New Clip',
        preview: 'new preview',
        content: 'new content',
        createdAt: Date.now(),
        sourceApp: 'Editor',
        sizeInfo: '12 B',
      },
    ]);
    await act(async () => {
      await newClipboard.promise;
      await Promise.resolve();
    });

    expect(latestSearch!.results.map((item) => item.id)).toEqual(['clip-new']);

    oldClipboard.resolve([
      {
        id: 'clip-old',
        kind: 'text',
        title: 'Old Clip',
        preview: 'old preview',
        content: 'old content',
        createdAt: Date.now(),
        sourceApp: 'Editor',
        sizeInfo: '10 B',
      },
    ]);
    await act(async () => {
      await oldClipboard.promise;
      await Promise.resolve();
    });

    expect(latestSearch!.results.map((item) => item.id)).toEqual(['clip-new']);
  });
});
