import { Suspense, lazy, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { X, Activity, Network, Terminal, Settings2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

// 懒加载子组件
const MonitorDashboard = lazy(() => import('./tabs/MonitorDashboard').then(module => ({ default: module.MonitorDashboard })));
const PortManager = lazy(() => import('./tabs/PortManager').then(module => ({ default: module.PortManager })));
const EnvFingerprint = lazy(() => import('./tabs/EnvFingerprint').then(module => ({ default: module.EnvFingerprint })));
const NetworkDoctor = lazy(() => import('./tabs/NetworkDoctor').then(module => ({ default: module.NetworkDoctor })));

type TabType = 'dashboard' | 'ports' | 'env' | 'network';

const TAB_ORDER: TabType[] = ['dashboard', 'ports', 'env', 'network'];

const NAV_HIGHLIGHT_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 34,
  mass: 0.9,
};

const TAB_CONTENT_VARIANTS: Variants = {
  initial: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 28 : -28,
    scale: 0.985,
    filter: 'blur(6px)',
  }),
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: 'blur(0px)',
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -20 : 20,
    scale: 0.99,
    filter: 'blur(4px)',
  }),
};

const REDUCED_MOTION_VARIANTS: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export function SystemMonitorModal() {
  const [isMonitorOpen, setMonitorOpen] = useAppStore(
    useShallow((state) => [state.isMonitorOpen, state.setMonitorOpen])
  );
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [tabDirection, setTabDirection] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const isNetworkTab = activeTab === 'network';

  const changeTab = (nextTab: TabType) => {
    if (nextTab === activeTab) return;

    const currentIndex = TAB_ORDER.indexOf(activeTab);
    const nextIndex = TAB_ORDER.indexOf(nextTab);
    setTabDirection(nextIndex > currentIndex ? 1 : -1);
    setActiveTab(nextTab);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <MonitorDashboard />;
      case 'ports':
        return <PortManager />;
      case 'env':
        return <EnvFingerprint />;
      case 'network':
        return <NetworkDoctor />;
      default:
        return null;
    }
  };

  if (!isMonitorOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200 p-4">
      <motion.div
        layout
        transition={NAV_HIGHLIGHT_SPRING}
        className={cn(
          "w-full max-h-[90vh] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200",
          isNetworkTab ? "max-w-[1220px] h-[760px]" : "max-w-[950px] h-[650px]"
        )}
      >

        {/* Header */}
        <div className="h-14 px-6 border-b border-border flex items-center justify-between bg-secondary/10 shrink-0 select-none">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Activity className="text-primary" size={20} />
            {t('monitor.title')}
          </h2>
          <button
            onClick={() => setMonitorOpen(false)}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Sidebar */}
          <div className="w-48 bg-secondary/5 border-r border-border p-2 space-y-1 overflow-y-auto custom-scrollbar shrink-0 select-none">
            <NavBtn 
              active={activeTab === 'dashboard'} 
              onClick={() => changeTab('dashboard')} 
              icon={<Activity size={16} />} 
              label={t('monitor.navDashboard')} 
            />
            <NavBtn 
              active={activeTab === 'ports'} 
              onClick={() => changeTab('ports')} 
              icon={<Network size={16} />} 
              label={t('monitor.navPorts')} 
            />
            <NavBtn 
              active={activeTab === 'env'} 
              onClick={() => changeTab('env')} 
              icon={<Terminal size={16} />} 
              label={t('monitor.navEnv')} 
            />
            <NavBtn 
              active={activeTab === 'network'} 
              onClick={() => changeTab('network')} 
              icon={<Settings2 size={16} />} 
              label={t('monitor.navNetwork')} 
            />
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden relative bg-background/50">
            <AnimatePresence mode="wait" initial={false} custom={tabDirection}>
              <motion.div
                key={activeTab}
                custom={tabDirection}
                variants={shouldReduceMotion ? REDUCED_MOTION_VARIANTS : TAB_CONTENT_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={
                  shouldReduceMotion
                    ? { duration: 0.14, ease: 'easeOut' }
                    : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
                }
                className="h-full w-full"
              >
                <Suspense fallback={<DashboardSkeleton />}>
                  {renderTabContent()}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

interface NavBtnProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}

function NavBtn({ active, onClick, icon, label }: NavBtnProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      className={cn(
        "relative w-full overflow-hidden rounded-md border text-sm transition-colors",
        active
          ? "text-primary"
          : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {active && (
        <motion.span
          layoutId="monitor-nav-active"
          transition={NAV_HIGHLIGHT_SPRING}
          className="absolute inset-0 rounded-md border border-primary/10 bg-primary/10"
        />
      )}
      <span className="relative z-10 flex items-center gap-3 px-3 py-2.5 whitespace-nowrap">
        <span className="shrink-0">{icon}</span>
        <span className="overflow-hidden text-ellipsis font-medium">{label}</span>
      </span>
    </motion.button>
  );
}

// 骨架屏优化：高度填满容器，布局模拟真实的 Dashboard
function DashboardSkeleton() {
  return (
    <div className="h-full flex flex-col p-6 gap-6 animate-in fade-in duration-500">

      {/* 顶部指标卡片骨架 */}
      <div className="grid grid-cols-2 gap-4 shrink-0">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-card border border-border p-4 rounded-xl shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-secondary rounded animate-pulse" />
                <div className="h-3 w-20 bg-secondary rounded animate-pulse" />
              </div>
              <div className="h-6 w-16 bg-secondary rounded animate-pulse" />
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-primary/10 rounded-full animate-pulse" />
            </div>
            <div className="h-2 w-24 bg-secondary rounded ml-auto animate-pulse" />
          </div>
        ))}
      </div>

      {/* 进程列表骨架 - 模拟表格结构 */}
      <div className="flex-1 min-h-0 bg-secondary/20 rounded-xl border border-border overflow-hidden flex flex-col">
        {/* 表头骨架 */}
        <div className="px-4 py-3 border-b border-border/50 flex justify-between items-center bg-secondary/10 shrink-0">
          <div className="h-4 w-32 bg-secondary rounded animate-pulse" />
          <div className="h-4 w-20 bg-secondary rounded animate-pulse" />
        </div>
        
        {/* 表格内容骨架 */}
        <div className="flex-1 p-2 space-y-1 overflow-hidden">
          {/* 模拟表头行 */}
          <div className="flex gap-4 px-4 py-2 mb-2">
             <div className="h-3 w-16 bg-secondary/50 rounded" />
             <div className="h-3 w-32 bg-secondary/50 rounded" />
             <div className="h-3 w-24 bg-secondary/50 rounded ml-auto" />
          </div>
          {/* 模拟数据行 */}
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-2.5 rounded-md odd:bg-secondary/10">
              <div className="h-3 w-12 bg-secondary rounded animate-pulse opacity-50" />
              <div className="h-3 w-40 bg-secondary rounded animate-pulse" />
              <div className="h-3 w-16 bg-secondary rounded animate-pulse hidden sm:block" />
              <div className="h-3 w-12 bg-secondary rounded animate-pulse ml-auto" />
              <div className="h-3 w-16 bg-secondary rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
