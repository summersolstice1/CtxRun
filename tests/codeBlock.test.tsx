import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeBlock } from '@/components/ui/CodeBlock';

const { writeTextMock } = vi.hoisted(() => ({
  writeTextMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: writeTextMock,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/lib/markdown/starryNight', () => ({
  getCachedHighlightTree: () => null,
  highlightCodeTree: vi.fn(),
  renderHighlightTree: () => <span data-testid="highlight-tree" />,
}));

describe('CodeBlock', () => {
  afterEach(() => {
    cleanup();
  });

  it('forwards wrapLongLines to the wrapping styles', () => {
    const { container } = render(
      <CodeBlock language="text" wrapLongLines>
        {'first line\nsecond line'}
      </CodeBlock>
    );

    expect(container.querySelector('pre')?.className).toContain('whitespace-pre-wrap');
    expect(container.querySelector('pre')?.className).toContain('break-words');
    expect(container.querySelector('code')?.className).toContain('language-text');
    expect(container.textContent).toContain('first line');
  });
});
