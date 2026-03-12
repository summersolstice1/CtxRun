import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownContent } from '@/components/ui/MarkdownContent';

const { writeTextMock } = vi.hoisted(() => ({
  writeTextMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: writeTextMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('MarkdownContent', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders GFM tables inside a horizontal scroll container', () => {
    const { container } = render(
      <MarkdownContent content={'| Name | Value |\n| --- | --- |\n| Foo | Bar |'} />
    );

    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    expect(table?.parentElement?.className).toContain('overflow-x-auto');
    expect(container.querySelector('th')?.textContent).toBe('Name');
    expect(container.querySelector('td')?.textContent).toBe('Foo');
  });

  it('uses custom list styling and intercepts links when requested', () => {
    const handleOpenLink = vi.fn();
    const { container } = render(
      <MarkdownContent
        content={'- First item\n- Second item\n\n[OpenAI](https://openai.com)'}
        onOpenLink={handleOpenLink}
      />
    );

    const list = container.querySelector('ul');
    expect(list?.className).toContain('list-disc');

    fireEvent.click(screen.getByRole('link', { name: 'OpenAI' }));
    expect(handleOpenLink).toHaveBeenCalledWith('https://openai.com');
  });
});
