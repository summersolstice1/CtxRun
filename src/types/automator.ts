export type ClickType = 'Left' | 'Right' | 'Middle';

// 对应 Rust 的 enum StopCondition
// Rust: Infinite -> JSON: "Infinite"
// Rust: MaxCount(u64) -> JSON: { "MaxCount": number }
export type StopCondition = 'Infinite' | { MaxCount: number };

export interface ClickerConfig {
  intervalMs: number;
  clickType: ClickType;
  stopCondition: StopCondition;
  useFixedLocation: boolean;
  fixedX: number;
  fixedY: number;
}

export const DEFAULT_CLICKER_CONFIG: ClickerConfig = {
  intervalMs: 100,
  clickType: 'Left',
  stopCondition: 'Infinite',
  useFixedLocation: false,
  fixedX: 0,
  fixedY: 0
};
