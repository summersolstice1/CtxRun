import { Pin, PinOff, ScanText } from 'lucide-react';

import { cn } from '@/lib/utils';

interface PreviewQuickActionsProps {
  canUseOcr: boolean;
  isOcrOpen: boolean;
  isPinned: boolean;
  onToggleOcr: () => void;
  onTogglePinned: () => void;
  ocrRunTitle: string;
  ocrCloseTitle: string;
  pinTitle: string;
  unpinTitle: string;
  buttonClassName: string;
  activeButtonClassName?: string;
  iconSize?: number;
}

export function PreviewQuickActions({
  canUseOcr,
  isOcrOpen,
  isPinned,
  onToggleOcr,
  onTogglePinned,
  ocrRunTitle,
  ocrCloseTitle,
  pinTitle,
  unpinTitle,
  buttonClassName,
  activeButtonClassName,
  iconSize = 18,
}: PreviewQuickActionsProps) {
  return (
    <>
      {canUseOcr && (
        <button
          type="button"
          onClick={onToggleOcr}
          className={cn(buttonClassName, isOcrOpen && activeButtonClassName)}
          title={isOcrOpen ? ocrCloseTitle : ocrRunTitle}
        >
          <ScanText size={iconSize} />
        </button>
      )}
      <button
        type="button"
        onClick={onTogglePinned}
        className={buttonClassName}
        title={isPinned ? unpinTitle : pinTitle}
      >
        {isPinned ? <PinOff size={iconSize} /> : <Pin size={iconSize} />}
      </button>
    </>
  );
}
