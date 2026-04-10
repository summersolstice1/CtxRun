import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface PreviewOcrSplitLayoutProps {
  showPanel: boolean;
  preview: ReactNode;
  panel: ReactNode;
}

const LAYOUT_TRANSITION = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
};

export function PreviewOcrSplitLayout({
  showPanel,
  preview,
  panel,
}: PreviewOcrSplitLayoutProps) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : LAYOUT_TRANSITION;

  return (
    <div className="flex h-full overflow-hidden">
      <motion.div
        initial={false}
        animate={{ width: showPanel ? '75%' : '100%' }}
        transition={transition}
        className="min-w-0 shrink-0 overflow-hidden"
      >
        {preview}
      </motion.div>

      <motion.div
        initial={false}
        animate={
          showPanel
            ? reduceMotion
              ? { width: '25%', opacity: 1 }
              : { width: '25%', opacity: 1, x: 0, filter: 'blur(0px)' }
            : reduceMotion
              ? { width: '0%', opacity: 0 }
              : { width: '0%', opacity: 0, x: 18, filter: 'blur(6px)' }
        }
        transition={transition}
        style={{ pointerEvents: showPanel ? 'auto' : 'none' }}
        className="min-w-0 shrink-0 overflow-hidden"
      >
        <div className="h-full w-full">
          {panel}
        </div>
      </motion.div>
    </div>
  );
}
