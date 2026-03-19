import { useState, useEffect } from 'react';
import { getVersion, getName } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import { motion, Variants } from 'framer-motion';
import { Github, Loader2, AlertCircle, ExternalLink, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUsageGuide } from './hooks/useUsageGuide';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import iconUrl from '../../../src-tauri/icons/128x128.png';

const REPO_URL = "https://github.com/WinriseF/CtxRun";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { type: "spring", stiffness: 100 } 
  }
};

function openAboutLink(href: string): void {
  void open(href).catch((error) => {
    console.error('[AboutSection] Failed to open link:', error);
  });
}

export function AboutSection() {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState<string>('');
  const [appName, setAppName] = useState<string>('CtxRun');
  const { content, isLoading, error } = useUsageGuide();

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('Unknown'));
    getName().then(setAppName).catch(() => setAppName('CtxRun'));
  }, []);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background relative selection:bg-primary/20">
      <div className="relative bg-gradient-to-b from-secondary/30 to-background pt-16 pb-10 border-b border-border/40 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 blur-[80px] rounded-full pointer-events-none" />
        
        <motion.div 
          className="relative z-10 flex flex-col items-center justify-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
            <motion.div variants={itemVariants} className="relative group cursor-default">
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-purple-500 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 rounded-full scale-110" />
                <img 
                    src={iconUrl} 
                    alt="App Icon" 
                    className="w-24 h-24 relative z-10 transition-transform duration-500 ease-out group-hover:scale-105 group-hover:rotate-3 drop-shadow-2xl" 
                />
            </motion.div>

            <motion.h2 variants={itemVariants} className="text-3xl font-extrabold text-foreground tracking-tight mt-6 mb-2">
                {appName}
            </motion.h2>
            
            <motion.div variants={itemVariants} className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground bg-secondary/80 px-3 py-1 rounded-full border border-border/50 backdrop-blur-sm">
                    v{appVersion}
                </span>
                <span className="text-xs text-muted-foreground/60">•</span>
                <span className="text-xs text-muted-foreground/60">Early Access</span>
            </motion.div>

            <motion.div variants={itemVariants} className="flex gap-3 mt-8">
                <button 
                    onClick={() => open(REPO_URL)}
                    className="group flex items-center gap-2 px-5 py-2.5 bg-foreground text-background hover:bg-foreground/90 rounded-full text-sm font-semibold transition-all shadow-lg hover:shadow-xl active:scale-95"
                >
                    <Github size={16} className="transition-transform group-hover:-translate-y-0.5" />
                    <span>GitHub</span>
                </button>
                <button 
                    onClick={() => open(`${REPO_URL}/issues`)}
                    className="group flex items-center gap-2 px-5 py-2.5 bg-background border border-border/60 hover:bg-secondary/50 text-foreground rounded-full text-sm font-medium transition-all hover:border-border active:scale-95"
                >
                    <AlertCircle size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span>Feedback</span>
                </button>
            </motion.div>
        </motion.div>
      </div>

      <div className="sticky top-0 z-20 px-8 py-3 bg-background/80 backdrop-blur-xl border-y border-border/40 flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-wider shadow-sm transition-all">
         <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-primary" />
            {t('settings.usageGuide')}
         </div>
      </div>

      <div className="p-0 min-h-[400px] relative bg-background">
         {isLoading ? (
             <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-4 opacity-70">
                 <Loader2 size={32} className="animate-spin text-primary/50" />
                 <span className="text-sm font-medium animate-pulse">{t('settings.loadingUsage')}</span>
             </div>
         ) : error ? (
             <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-20 px-6 text-center"
             >
                 <div className="p-4 bg-destructive/5 rounded-full mb-4 ring-1 ring-destructive/20">
                     <AlertCircle size={32} className="text-destructive" />
                 </div>
                 <h3 className="text-lg font-semibold text-foreground mb-2">Oops!</h3>
                 <p className="text-sm text-muted-foreground mb-6 max-w-xs">{error}</p>
                 <button 
                     onClick={() => open(`${REPO_URL}/blob/main/USAGE.md`)}
                     className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors text-xs font-medium"
                 >
                     {t('settings.viewSource')} <ExternalLink size={12} />
                 </button>
             </motion.div>
         ) : (
              <div className="px-8 py-10 max-w-4xl mx-auto">
                  <MarkdownContent
                    content={content}
                    variant="github"
                    className="text-[0.95rem]"
                    linkClassName="font-semibold text-primary hover:text-primary/80"
                    onOpenLink={openAboutLink}
                  />

                  <div className="mt-16 pt-8 border-t border-border/30 text-center">
                     <p className="text-[10px] text-muted-foreground/40 font-mono">
                        © {new Date().getFullYear()} {appName}. Open Source under GPL-3.0 License.
                    </p>
                 </div>
                 
                 <div className="h-12" />
             </div>
         )}
      </div>
    </div>
  );
}
