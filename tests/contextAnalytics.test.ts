import { describe, expect, it } from 'vitest';

import { analyzeContext } from '@/lib/context_analytics';
import { FileNode } from '@/types/context';
import { AIModelConfig } from '@/types/model';

function fileNode(
  id: string,
  name: string,
  size: number | undefined,
  isSelected: boolean
): FileNode {
  return {
    id,
    name,
    path: `/${name}`,
    kind: 'file',
    size,
    isSelected,
  };
}

describe('context analytics', () => {
  it('analyzes selected files, language stats, top files and model costs', () => {
    const nodes: FileNode[] = [
      {
        id: 'root',
        name: 'root',
        path: '/root',
        kind: 'dir',
        isSelected: true,
        children: [
          fileNode('ts', 'index.ts', 100, true),
          fileNode('js', 'helper.js', 50, true),
          fileNode('skip', 'ignore.md', 999, false),
          {
            id: 'nested',
            name: 'nested',
            path: '/nested',
            kind: 'dir',
            isSelected: true,
            children: [fileNode('other', 'README', 50, true)],
          },
        ],
      },
    ];

    const models: AIModelConfig[] = [
      {
        id: 'm1',
        name: 'Model A',
        provider: 'OpenAI',
        contextLimit: 128000,
        inputPricePerMillion: 2,
      },
      {
        id: 'm2',
        name: 'Model B',
        provider: 'Anthropic',
        contextLimit: 200000,
        inputPricePerMillion: 4,
      },
    ];

    const data = analyzeContext(nodes, 2_500_000, models);

    expect(data.topFiles.map((f) => f.id)).toEqual(['ts', 'js', 'other']);

    const langNames = data.languages.map((l) => l.name);
    expect(langNames).toEqual(expect.arrayContaining(['TypeScript', 'JavaScript', 'Other']));
    expect(data.languages.find((l) => l.name === 'TypeScript')?.percentage).toBe(50);
    expect(data.languages.find((l) => l.name === 'JavaScript')?.percentage).toBe(25);
    expect(data.languages.find((l) => l.name === 'Other')?.percentage).toBe(25);
    expect(data.languages.find((l) => l.name === 'Other')?.color).toBe('bg-slate-500');

    expect(data.modelCosts).toEqual([
      {
        modelId: 'm1',
        modelName: 'Model A',
        limit: 128000,
        cost: 5,
      },
      {
        modelId: 'm2',
        modelName: 'Model B',
        limit: 200000,
        cost: 10,
      },
    ]);
  });

  it('returns zero percentages when selected files have no measurable size', () => {
    const nodes: FileNode[] = [fileNode('a', 'empty.ts', undefined, true)];
    const data = analyzeContext(nodes, 0, []);

    expect(data.languages).toHaveLength(1);
    expect(data.languages[0].name).toBe('TypeScript');
    expect(data.languages[0].percentage).toBe(0);
    expect(data.topFiles).toHaveLength(1);
    expect(data.modelCosts).toEqual([]);
  });
});
