export type PreviewType =
  | 'image'
  | 'video'
  | 'audio'
  | 'code'
  | 'markdown'
  | 'html'
  | 'pdf'
  | 'archive'
  | 'binary'
  | 'office';

export type PreviewMode = 'default' | 'source' | 'rendered' | 'formatted' | 'table';

export interface FileMeta {
  path: string;
  name: string;
  size: number;
  previewType: PreviewType;
  supportedModes: PreviewMode[];
  defaultMode: PreviewMode;
  mime: string;
}
