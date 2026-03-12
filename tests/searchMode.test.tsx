import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchMode } from '@/components/features/spotlight/modes/search/SearchMode';
import type { SpotlightItem } from '@/types/spotlight';

const spotlightState = {
  setQuery: vi.fn(),
  inputRef: { current: null as HTMLInputElement | null },
  setSearchScope: vi.fn(),
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/features/spotlight/core/SpotlightContext', () => ({
  useSpotlight: () => spotlightState,
}));

vi.mock('@/store/useContextStore', () => ({
  useContextStore: () => ({
    projectRoot: null,
  }),
}));

vi.mock('@/lib/command_executor', () => ({
  executeCommand: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/components/ui/SearchEngineIcon', () => ({
  SearchEngineIcon: () => <span>icon</span>,
}));

describe('SearchMode clipboard preview', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('preserves multiline clipboard content in the active preview block', () => {
    const results: SpotlightItem[] = [
      {
        id: 'clip-1',
        title: 'First line',
        description: 'just now • VSCode • 12 B',
        content: 'First line\nSecond line\nThird line',
        type: 'clipboard',
      },
    ];

    const { container } = render(
      <SearchMode
        results={results}
        selectedIndex={0}
        setSelectedIndex={vi.fn()}
        onSelect={vi.fn()}
        copiedId={null}
      />
    );

    const preview = container.querySelector('.whitespace-pre-wrap');
    expect(preview).toBeTruthy();
    expect(preview?.textContent).toContain('First line\nSecond line\nThird line');
    expect(preview?.className).toContain('max-h-36');
  });

  it('does not show raw image paths for clipboard image items', () => {
    const results: SpotlightItem[] = [
      {
        id: 'clip-image',
        title: '[Image/图片]',
        description: 'just now • explorer • 396x936',
        content: 'C:\\Users\\Flynn\\AppData\\Local\\com.ctxrun\\refinery_images\\sample.png',
        type: 'clipboard',
        isImage: true,
      },
    ];

    const { container } = render(
      <SearchMode
        results={results}
        selectedIndex={0}
        setSelectedIndex={vi.fn()}
        onSelect={vi.fn()}
        copiedId={null}
      />
    );

    expect(container.textContent).not.toContain('refinery_images\\sample.png');
  });
});
