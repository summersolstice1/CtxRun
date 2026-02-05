import { ReactNode } from 'react';
import { Prompt } from './prompt';

// 1. 修改模式定义，增加 'clipboard'
export type SpotlightMode = 'search' | 'chat' | 'clipboard';

export type SearchScope = 'global' | 'app' | 'command' | 'prompt' | 'math' | 'shell' | 'web';

export interface SpotlightItem {
  id: string;
  title: string;
  description?: string;
  content?: string;

  icon?: ReactNode;
  group?: string;

  originalData?: Prompt;

  // 2. 在 type 中增加 'clipboard'
  type: 'prompt' | 'command' | 'action' | 'url' | 'app' | 'math' | 'shell' | 'shell_history' | 'web_search' | 'clipboard';

  isExecutable?: boolean;
  shellType?: string;
  url?: string;

  appPath?: string;

  mathResult?: string;
  shellCmd?: string;
  historyCommand?: string;

  // 3. 增加剪贴板特有字段
  isImage?: boolean;
}

export interface SpotlightState {
  mode: SpotlightMode;
  query: string;
  chatInput: string;
}