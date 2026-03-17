import { FilePatch, PatchOperation } from '@/components/features/patch/patch_types';

export function parseMultiFilePatch(text: string): FilePatch[] {
  const filePatches: FilePatch[] = [];

  const fileRegex = /(?:^|\n)#{0,3}\s*File:\s*(.+?)(?=\n|$)/gi;
  let match;

  const fileMatches: { path: string, start: number }[] = [];
  while ((match = fileRegex.exec(text)) !== null) {
    fileMatches.push({ path: match[1].trim(), start: match.index });
  }

  if (fileMatches.length === 0) {
    const ops = parseOperations(text);
    if (ops.length > 0) {
      filePatches.push({ filePath: 'current_file', operations: ops });
    }
    return filePatches;
  }

  const patchesMap = new Map<string, PatchOperation[]>();

  for (let i = 0; i < fileMatches.length; i++) {
    const current = fileMatches[i];
    const next = fileMatches[i+1];
    const end = next ? next.start : text.length;

    const content = text.substring(current.start, end);
    const ops = parseOperations(content);

    if (ops.length > 0) {
        const existing = patchesMap.get(current.path) || [];
        patchesMap.set(current.path, existing.concat(ops));
    }
  }

  for (const [filePath, operations] of patchesMap.entries()) {
      filePatches.push({ filePath, operations });
  }

  return filePatches;
}

function parseOperations(content: string): PatchOperation[] {
  const ops: PatchOperation[] = [];
  const blockRegex = /<{5,}\s*SEARCH\s*([\s\S]*?)\s*={5,}\s*([\s\S]*?)\s*>{5,}\s*REPLACE/gi;

  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    ops.push({
      originalBlock: match[1],
      modifiedBlock: match[2]
    });
  }
  return ops;
}
