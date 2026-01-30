export type RefineryKind = 'text' | 'image';

export interface RefineryMetadata {
  width?: number;
  height?: number;
  format?: string;
  tokens?: number;
}

export interface RefineryItem {
  id: string;
  kind: RefineryKind;
  content: string;      // 文本内容 或 图片路径
  contentHash: string;
  preview: string;      // 列表显示的摘要
  sourceApp?: string;
  sizeInfo: string;
  isPinned: boolean;
  metadata: string;     // 原始 JSON 字符串
  createdAt: number;
  updatedAt: number;
}

// 用于 UI 渲染的扩展接口
export interface RefineryItemUI extends Omit<RefineryItem, 'metadata'> {
  metaParsed: RefineryMetadata;
}
