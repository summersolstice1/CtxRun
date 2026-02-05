import { useState, useEffect, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { Minus, X, Maximize2, Copy, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { ClockPopover } from '@/components/ui/ClockPopover';

const appWindow = getCurrentWebviewWindow()

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isClockPopoverOpen, setIsClockPopoverOpen] = useState(false);
  const clockTriggerRef = useRef<HTMLDivElement>(null);
  const { language, windowDestroyDelay } = useAppStore();

  useEffect(() => {
    const checkMaximized = async () => { setIsMaximized(await appWindow.isMaximized()); };
    const unlisten = appWindow.onResized(checkMaximized);
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => { 
      unlisten.then(f => f());
      clearInterval(timer);
    }
  }, []);

  const toggleMaximize = async () => {
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false
    }).format(date);
  };

  const handleHide = () => {
    invoke('hide_main_window', { delaySecs: windowDestroyDelay }).catch(console.error);
  };

  const btnClass = "h-7 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary/50";

  return (
    <div
      data-tauri-drag-region
      className="h-8 bg-background flex items-center justify-between select-none border-b border-border shrink-0 transition-colors duration-300"
    >
      <div className="flex items-center gap-2 px-4 h-full relative">
        <div
          ref={clockTriggerRef}
          onClick={(e) => {
            e.stopPropagation();
            setIsClockPopoverOpen(!isClockPopoverOpen);
          }}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary/30 border border-border/50 cursor-pointer hover:bg-secondary/50 transition-colors pointer-events-auto"
        >
           <Clock size={12} className="text-primary/70" />
           <span className="text-[10px] font-mono font-medium text-muted-foreground tracking-wide tabular-nums">
              {formatTime(currentTime)}
           </span>
        </div>

        {/* 时钟下拉面板 */}
        <ClockPopover
          currentTime={currentTime}
          isOpen={isClockPopoverOpen}
          onClose={() => setIsClockPopoverOpen(false)}
          triggerRef={clockTriggerRef}
        />
      </div>

      <div className="flex h-full items-center px-1 gap-1">
        <button onClick={() => appWindow.minimize()} className={btnClass}><Minus size={14} /></button>
        <button onClick={toggleMaximize} className={btnClass}>{isMaximized ? <Copy size={12} /> : <Maximize2 size={12} />}</button>
        <button onClick={handleHide} className={cn(btnClass, "hover:bg-destructive/80 hover:text-destructive-foreground")}><X size={14} /></button>
      </div>
    </div>
  );
}