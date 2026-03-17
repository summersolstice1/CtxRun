import { useState, useEffect, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { Minus, X, Maximize2, Copy, Clock, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { ClockPopover } from '@/components/ui/ClockPopover';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { ViewSwitcher } from '@/components/layout/ViewSwitcher';
import { isPrimaryAppView, type PrimaryAppView, getAdjacentPrimaryView } from '@/lib/app-navigation';
import { useTranslation } from 'react-i18next';

const appWindow = getCurrentWebviewWindow()

export function TitleBar() {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isClockPopoverOpen, setIsClockPopoverOpen] = useState(false);
  const clockTriggerRef = useRef<HTMLDivElement>(null);
  const { language, windowDestroyDelay, currentView, setView } = useAppStore();
  const lastPrimaryViewRef = useRef<PrimaryAppView>('prompts');

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

  useEffect(() => {
    if (isPrimaryAppView(currentView)) {
      lastPrimaryViewRef.current = currentView;
    }
  }, [currentView]);

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
  const activePrimaryView = isPrimaryAppView(currentView) ? currentView : lastPrimaryViewRef.current;
  const handleSettingsClick = () => {
    if (currentView === 'settings') {
      setView(lastPrimaryViewRef.current);
      return;
    }

    setView('settings');
  };

  return (
    <div
      className="h-8 bg-background flex items-center justify-between select-none border-b border-border shrink-0 transition-colors duration-300 relative"
    >
      <div data-tauri-drag-region className="absolute inset-0" />

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

        <ClockPopover
          currentTime={currentTime}
          isOpen={isClockPopoverOpen}
          onClose={() => setIsClockPopoverOpen(false)}
          triggerRef={clockTriggerRef}
        />

        <WorkspaceSwitcher />
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <ViewSwitcher
            activeView={activePrimaryView}
            onSelect={(view) => setView(view)}
            onCycle={(delta) => setView(getAdjacentPrimaryView(activePrimaryView, delta))}
          />
        </div>
      </div>

      <div className="flex h-full items-center px-1 gap-1 relative z-10">
        <button
          onClick={handleSettingsClick}
          className={cn(btnClass, currentView === 'settings' && "text-primary bg-primary/10")}
          title={currentView === 'settings' ? t('topbar.backToModule', { module: t(`menu.${lastPrimaryViewRef.current}`) }) : t('topbar.openSettings')}
        >
          <Settings size={14} />
        </button>
        <button onClick={() => appWindow.minimize()} className={btnClass}><Minus size={14} /></button>
        <button onClick={toggleMaximize} className={btnClass}>{isMaximized ? <Copy size={12} /> : <Maximize2 size={12} />}</button>
        <button onClick={handleHide} className={cn(btnClass, "hover:bg-destructive/80 hover:text-destructive-foreground")}><X size={14} /></button>
      </div>
    </div>
  );
}
