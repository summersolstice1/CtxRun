const ALLOWED_CHARS_REGEX = /^[0-9+\-*/%^()).\s a-z]+$/;

export function evaluateMath(input: string): string | null {
  let expr = input.replace(/^=/, '').trim().toLowerCase();
  if (!expr) return null;

  try {
    if (!ALLOWED_CHARS_REGEX.test(expr)) return null;

    expr = expr
      .replace(/\^/g, '**')
      .replace(/pi/g, 'Math.PI')
      .replace(/e/g, 'Math.E')
      .replace(/sin/g, 'Math.sin')
      .replace(/cos/g, 'Math.cos')
      .replace(/tan/g, 'Math.tan')
      .replace(/sqrt/g, 'Math.sqrt')
      .replace(/log/g, 'Math.log10')
      .replace(/ln/g, 'Math.log')
      .replace(/abs/g, 'Math.abs');

    const func = new Function(`return ${expr};`);
    const result = func();

    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      const rounded = parseFloat(result.toPrecision(12));

      if (Math.abs(rounded) < 1e-10) {
        return '0';
      }

      const strRes = rounded.toString();
      if (strRes.length > 20) {
        return result.toExponential(4);
      }

      return strRes;
    }
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * 计算清理缓冲区阈值
 * 当条目数量达到此阈值时触发清理
 * @param maxCount 最大条目限制
 * @param bufferPercent 缓冲百分比（默认 10%）
 * @returns 触发清理的阈值
 */
export function getCleanupThreshold(maxCount: number, bufferPercent: number = 10): number {
  return Math.ceil((maxCount * (100 + bufferPercent)) / 100);
}

/**
 * 格式化 Refinery 清理配置的阈值显示
 * @param maxCount 最大条目限制
 * @returns 格式化后的阈值
 */
export function formatRefineryBufferThreshold(maxCount: number): number {
  return getCleanupThreshold(maxCount, 10);
}
