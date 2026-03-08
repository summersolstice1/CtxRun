import { describe, expect, it } from 'vitest';

import { assembleChatPrompt, fillTemplate, parseVariables } from '@/lib/template';

describe('template utils', () => {
  it('parseVariables extracts and deduplicates placeholders', () => {
    const vars = parseVariables('Hi {{ name }}, {{name}} and {{ role }}');
    expect(vars).toEqual(['name', 'role']);
  });

  it('fillTemplate replaces known placeholders and keeps unknown ones', () => {
    const result = fillTemplate('Hello {{name}}, from {{city}}', { name: 'Flynn' });
    expect(result).toBe('Hello Flynn, from {{city}}');
  });

  it('assembleChatPrompt fills all variables with trimmed input', () => {
    const result = assembleChatPrompt('Task: {{goal}} / Notes: {{goal}}', '  ship it  ');
    expect(result).toBe('Task: ship it / Notes: ship it');
  });

  it('assembleChatPrompt appends input when template has no variables', () => {
    const result = assembleChatPrompt('Base prompt', 'extra context');
    expect(result).toBe('Base prompt\n\nextra context');
  });

  it('assembleChatPrompt keeps template unchanged with blank input and no variables', () => {
    const result = assembleChatPrompt('Base prompt', '   ');
    expect(result).toBe('Base prompt');
  });
});
