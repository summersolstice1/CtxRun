import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeBlock } from '@/components/ui/CodeBlock';

const { writeTextMock, syntaxHighlighterMock } = vi.hoisted(() => ({
  writeTextMock: vi.fn(),
  syntaxHighlighterMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: writeTextMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-syntax-highlighter', () => ({
  Prism: (props: any) => {
    syntaxHighlighterMock(props);
    return <div data-testid="syntax-highlighter">{props.children}</div>;
  },
}));

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {},
}));

describe('CodeBlock', () => {
  afterEach(() => {
    cleanup();
    syntaxHighlighterMock.mockReset();
  });

  it('forwards wrapLongLines to the syntax highlighter and wrapping styles', () => {
    const { container } = render(
      <CodeBlock language="text" wrapLongLines>
        {'first line\nsecond line'}
      </CodeBlock>
    );

    expect(syntaxHighlighterMock).toHaveBeenCalledTimes(1);
    const props = syntaxHighlighterMock.mock.calls[0][0];
    expect(props.wrapLongLines).toBe(true);
    expect(props.customStyle.whiteSpace).toBe('pre-wrap');
    expect(props.customStyle.overflowX).toBe('hidden');
    expect(props.customStyle.userSelect).toBe('text');
    expect(props.codeTagProps.style.overflowWrap).toBe('anywhere');
    expect(props.codeTagProps.style.userSelect).toBe('text');
    expect(screen.getByTestId('syntax-highlighter').parentElement?.className).toContain('select-text');
    expect(container.textContent).toContain('first line');
  });
});
