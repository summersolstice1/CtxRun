import { useEffect } from 'react';
import { RefinerySidebar } from './RefinerySidebar';
import { RefineryFeed } from './RefineryFeed';
import { RefineryDrawer } from './RefineryDrawer';
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
    <div className="h-full flex items-stretch bg-background relative overflow-hidden">
      {/* Left Sidebar - Calendar & Filters */}
      <RefinerySidebar />

      {/* Middle Content - Feed Stream */}
      <RefineryFeed />

      {/* Right Drawer - Detail Overlay (2/3) */}
      <RefineryDrawer />
    </div>
  );
}
