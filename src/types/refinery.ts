export type RefineryKind = 'text' | 'image' | 'mixed';

export interface RefineryMetadata {
  width?: number;
  height?: number;
  format?: string;
  tokens?: number;
  image_path?: string; // 混合类型的图片路径
}

export interface RefineryItem {
  id: string;
  kind: RefineryKind;
  content: string;      // 文本内容 或 图片路径
  contentHash: string;
  preview: string;      // 列表显示的摘要
  sourceApp?: string;
  url?: string;         // 浏览器 URL (仅浏览器复制时有效)
  sizeInfo: string;
  isPinned: boolean;
  metadata: string;     // 原始 JSON 字符串
  createdAt: number;
  updatedAt: number;
  // [新增字段]
  title?: string | null;
  tags?: string[] | null;
  isManual: boolean;
  isEdited: boolean;
}

// 用于 UI 渲染的扩展接口
export interface RefineryItemUI extends Omit<RefineryItem, 'metadata'> {
  metaParsed: RefineryMetadata;
}
