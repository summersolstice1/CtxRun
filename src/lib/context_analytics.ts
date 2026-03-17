import { FileNode } from '@/types/context';
import { AIModelConfig } from '@/types/model';
import { getLanguageInfo } from '@/lib/langs';

interface LanguageStat {
  name: string;
  count: number;
  size: number;
  color: string;
  percentage: number;
}

interface ModelCostStat {
  modelId: string;
  modelName: string;
  limit: number;
  cost: number;
}

interface AnalyticsData {
  languages: LanguageStat[];
  topFiles: FileNode[];
  modelCosts: ModelCostStat[];
}

function getFlatSelectedFiles(nodes: FileNode[]): FileNode[] {
  let files: FileNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'file' && node.isSelected) {
      files.push(node);
    }
    if (node.children) {
      files = files.concat(getFlatSelectedFiles(node.children));
    }
  }
  return files;
}

export function analyzeContext(
  nodes: FileNode[],
  totalTokens: number,
  models: AIModelConfig[] // 必传参数
): AnalyticsData {
  const files = getFlatSelectedFiles(nodes);
  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

  const langStats: Record<string, { count: number; size: number; ext: string }> = {};
  files.forEach(f => {
    const ext = f.name.split('.').pop()?.toLowerCase() || 'unknown';
    const info = getLanguageInfo(f.name);

    const langName = info.name === 'Unknown' ? 'Other' : info.name;

    if (!langStats[langName]) {
      langStats[langName] = { count: 0, size: 0, ext };
    }
    langStats[langName].count++;
    langStats[langName].size += (f.size || 0);
  });

  const languages: LanguageStat[] = Object.entries(langStats)
    .map(([name, stat]) => {
      const info = getLanguageInfo(`test.${stat.ext}`);
      return {
        name,
        count: stat.count,
        size: stat.size,
        color: name === 'Other' ? 'bg-slate-500' : info.color,
        percentage: totalSize > 0 ? parseFloat((stat.size / totalSize * 100).toFixed(1)) : 0
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topFiles = [...files]
    .sort((a, b) => (b.size || 0) - (a.size || 0))
    .slice(0, 5);

  const millions = totalTokens / 1_000_000;
  const modelCosts: ModelCostStat[] = models.map(model => ({
    modelId: model.id,
    modelName: model.name,
    limit: model.contextLimit,
    cost: millions * model.inputPricePerMillion
  }));

  return {
    languages,
    topFiles,
    modelCosts
  };
}
