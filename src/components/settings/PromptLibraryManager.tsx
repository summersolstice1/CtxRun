import { useEffect, useState } from 'react';
import { Download, Trash2, RefreshCw, Box, Check, Loader2, Globe, Sparkles, Terminal, AlertCircle, ExternalLink } from 'lucide-react';
import { usePromptStore } from '@/store/usePromptStore';
import { useAppStore } from '@/store/useAppStore';
import { SettingsSurface } from '@/components/settings/SettingsUi';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-shell'; 

export function PromptLibraryManager() {
  const { t } = useTranslation();
  const {
    manifest, fetchManifest, installPack, uninstallPack,
    installedPackIds, isStoreLoading
  } = usePromptStore();

  const { language } = useAppStore();
  const [activeTab, setActiveTab] = useState<'prompt' | 'command'>('prompt');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchManifest();
  }, []);

  const handleInstall = async (pack: any) => {
      try {
          setErrorMsg(null);
          await installPack(pack);
      } catch (err: any) {
          const msg = err.message || t('library.unknownError');
          setErrorMsg(msg);
          setTimeout(() => setErrorMsg(null), 8000);
      }
  };

  const availablePacks = manifest?.packages.filter(p => 
      p.language === language && 
      (p.category || 'command') === activeTab
  ) || [];

  const getSourceInfo = () => {
      if (activeTab === 'command') {
          return {
              name: 'tldr-pages/tldr',
              url: 'https://github.com/tldr-pages/tldr'
          };
      } else {
          return {
              name: 'Awesome ChatGPT Prompts',
              url: 'https://github.com/f/awesome-chatgpt-prompts'
          };
      }
  };

  const sourceInfo = getSourceInfo();
  const installedLabel = t('library.installed');

  return (
    <div className="flex flex-col h-full relative">

      <SettingsSurface className="mb-4 shrink-0 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Globe size={16} className="text-primary"/>
              {t('library.title')}
            </h3>
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-1">
              <span>{t('library.desc')}</span>
              <button
                onClick={() => open(sourceInfo.url)}
                className="flex items-center gap-0.5 rounded bg-primary/5 px-1.5 py-0.5 font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                title={t('library.openSource', { url: sourceInfo.url })}
              >
                {sourceInfo.name}
                <ExternalLink size={10} />
              </button>
            </div>
          </div>

          <button
            onClick={() => { setErrorMsg(null); fetchManifest(); }}
            disabled={isStoreLoading}
            className="rounded-full p-2 transition-colors hover:bg-secondary"
            title={t('library.refresh')}
          >
            <RefreshCw size={16} className={cn(isStoreLoading && "animate-spin")} />
          </button>
        </div>

        <div className="flex gap-2 border-b border-border/50">
          <button
            onClick={() => setActiveTab('prompt')}
            className={cn("flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-bold transition-colors", activeTab === 'prompt' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            <Sparkles size={14} /> {t('common.prompts')}
          </button>
          <button
            onClick={() => setActiveTab('command')}
            className={cn("flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-bold transition-colors", activeTab === 'command' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            <Terminal size={14} /> {t('common.commands')}
          </button>
        </div>
      </SettingsSurface>

      {errorMsg && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-destructive mb-0.5">{t('common.error')}</h4>
                <p className="text-xs text-destructive/80 break-all whitespace-pre-wrap">{errorMsg}</p>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-destructive/60 hover:text-destructive text-xs">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {isStoreLoading && !manifest && (
            <div className="flex justify-center py-10 text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="animate-spin" />
                    <span className="text-xs">{t('library.loading')}</span>
                </div>
            </div>
        )}

        {!isStoreLoading && availablePacks.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-xs">
                {t('library.noPacks')}
            </div>
        )}

        {availablePacks.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
            {availablePacks.map(pack => {
              const isInstalled = installedPackIds.includes(pack.id);
              return (
                <div
                  key={pack.id}
                  className="group flex min-h-[190px] flex-col rounded-2xl border border-border bg-card/90 p-4 transition-all hover:border-primary/30 hover:bg-card"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
                        isInstalled ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {isInstalled ? <Check size={24} /> : <Box size={24} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="break-words text-base font-semibold leading-snug text-foreground">
                        {pack.name}
                      </h4>
                      <p
                        className="mt-1 text-sm leading-relaxed text-muted-foreground"
                        title={pack.description}
                      >
                        {pack.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-muted-foreground/80">
                    <span className="rounded-full border border-border/70 bg-secondary/40 px-2 py-1">
                      {pack.count} {t('library.prompts')}
                    </span>
                    <span className="rounded-full border border-border/70 bg-secondary/40 px-2 py-1">
                      {pack.size_kb} KB
                    </span>
                    {isInstalled && (
                      <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-1 text-green-500">
                        {installedLabel}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex items-center justify-end gap-2 pt-5">
                    {isInstalled ? (
                      <>
                        <button
                          onClick={() => handleInstall(pack)}
                          disabled={isStoreLoading}
                          className="rounded-md bg-secondary px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/80"
                        >
                          {t('library.update')}
                        </button>
                        <button
                          onClick={() => uninstallPack(pack.id)}
                          disabled={isStoreLoading}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title={t('library.uninstall')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleInstall(pack)}
                        disabled={isStoreLoading}
                        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors shadow-sm hover:bg-primary/90"
                      >
                        <Download size={14} />
                        {t('library.download')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  );
}
