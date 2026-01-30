import { useEffect } from 'react';
import { HistorySidebar } from './HistorySidebar';
import { ContentWorkbench } from './ContentWorkbench';
import { useRefineryStore } from '@/store/useRefineryStore';

export function RefineryView() {
  const { init, unlisten } = useRefineryStore();

  useEffect(() => {
    init();
    return () => {
      unlisten();
    };
  }, []);

  return (
    <div className="h-full flex items-stretch overflow-hidden animate-in fade-in duration-300">
        {/* Left Sidebar */}
        <HistorySidebar />

        {/* Right Workbench */}
        <ContentWorkbench />
    </div>
  );
}
