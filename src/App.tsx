import { useEffect, useRef, Suspense, lazy } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { TitleBar } from "@/components/layout/TitleBar";
import { useAppStore, AppTheme } from "@/store/useAppStore";
import { GlobalConfirmDialog } from "@/components/ui/GlobalConfirmDialog";
import { useTranslation } from 'react-i18next';
import { PreviewModal } from "@/components/features/hyperview";
import { applyThemeToDocument } from '@/lib/theme';
import {
  getAdjacentPrimaryView,
  getPrimaryViewByHotkey,
  isEditableTarget,
  isPrimaryAppView,
  type PrimaryAppView,
} from '@/lib/app-navigation';
const PromptView = lazy(() => import('@/components/features/prompts/PromptView').then(module => ({ default: module.PromptView })));
const ContextView = lazy(() => import('@/components/features/context/ContextView').then(module => ({ default: module.ContextView })));
const PatchView = lazy(() => import('@/components/features/patch/PatchView').then(module => ({ default: module.PatchView })));
const RefineryView = lazy(() => import('@/components/features/refinery/RefineryView').then(module => ({ default: module.RefineryView })));
const AutomatorView = lazy(() => import('@/components/features/automator/AutomatorView').then(module => ({ default: module.AutomatorView })));
const MinerView = lazy(() => import('@/components/features/miner/MinerView').then(module => ({ default: module.MinerView })));
const SettingsView = lazy(() => import('@/components/settings/SettingsView').then(module => ({ default: module.SettingsView })));
const SystemMonitorModal = lazy(() => import('@/components/features/monitor/SystemMonitorModal').then(module => ({ default: module.SystemMonitorModal })));

const appWindow = getCurrentWebviewWindow()

function App() {
  const [currentView, theme, setTheme, syncModels, lastUpdated, restReminder, setView] = useAppStore(
    useShallow((state) => [
      state.currentView,
      state.theme,
      state.setTheme,
      state.syncModels,
      state.lastUpdated,
      state.restReminder,
      state.setView
    ])
  );
  const { t } = useTranslation();
  const lastPrimaryViewRef = useRef<PrimaryAppView>('prompts');

  useEffect(() => {
    if (isPrimaryAppView(currentView)) {
      lastPrimaryViewRef.current = currentView;
    }
  }, [currentView]);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    const unlistenPromise = listen<AppTheme>('theme-changed', (event) => {
        setTheme(event.payload, true);
    });

    appWindow.show();
    appWindow.setFocus();

    return () => {
        unlistenPromise.then(unlisten => unlisten());
    };
  }, [setTheme]);

  useEffect(() => {
    const handleBlur = () => {
      document.body.classList.add('reduce-performance');
    };
    const handleFocus = () => {
      document.body.classList.remove('reduce-performance');
    };

    const unlistenBlur = listen('tauri://blur', handleBlur);
    const unlistenFocus = listen('tauri://focus', handleFocus);

    return () => {
      unlistenBlur.then(unlisten => unlisten());
      unlistenFocus.then(unlisten => unlisten());
    };
  }, []);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (import.meta.env.PROD || !e.ctrlKey) {
        e.preventDefault();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        const isMac = navigator.platform.includes('Mac');

        if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
            e.preventDefault();
        }
        if ((e.ctrlKey || e.metaKey) && key === 'f') {
            e.preventDefault();
        }

        if (isEditableTarget(e.target)) {
          return;
        }

        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          const hotkey = Number.parseInt(key, 10);
          const nextView = Number.isNaN(hotkey) ? null : getPrimaryViewByHotkey(hotkey);

          if (nextView) {
            e.preventDefault();
            setView(nextView);
            return;
          }
        }

        const cycleModifierPressed = isMac ? e.metaKey : e.ctrlKey;
        if (cycleModifierPressed && e.key === 'Tab') {
          e.preventDefault();
          const baseView = isPrimaryAppView(currentView) ? currentView : lastPrimaryViewRef.current;
          setView(getAdjacentPrimaryView(baseView, e.shiftKey ? -1 : 1));
        }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentView, setView]);

  useEffect(() => {
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (Date.now() - lastUpdated > ONE_DAY) {
        void syncModels();
    }
  }, [lastUpdated, syncModels]);

  useEffect(() => {
    void invoke('update_reminder_config', {
      enabled: restReminder.enabled,
      intervalMinutes: restReminder.intervalMinutes
    }).catch((err) => {
      console.error('[App] Failed to update reminder config:', err);
    });
  }, [restReminder.enabled, restReminder.intervalMinutes]);

  return (
    <>
      <style>{`
        body.reduce-performance * {
          animation-play-state: paused !important;
        }
      `}</style>
      <div className="h-screen w-full bg-background text-foreground overflow-hidden flex flex-col rounded-lg border border-border transition-colors duration-300 relative shadow-2xl">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 min-w-0 relative transition-colors duration-300">
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 animate-in fade-in">
                <Loader2 className="animate-spin text-primary" size={32} />
                <span className="text-sm">{t('common.loadingModule')}</span>
            </div>
          }>
            {currentView === 'prompts' && <PromptView />}
            {currentView === 'context' && <ContextView />}
            {currentView === 'patch' && <PatchView />}
            {currentView === 'refinery' && <RefineryView />}
            {currentView === 'automator' && <AutomatorView />}
            {currentView === 'miner' && <MinerView />}
            {currentView === 'settings' && <SettingsView />}
          </Suspense>
        </main>
      </div>
      <Suspense fallback={null}>
        <SystemMonitorModal />
      </Suspense>
      <PreviewModal />
      <GlobalConfirmDialog />
    </div>
    </>
  );
}

export default App;
