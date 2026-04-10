import { useEffect } from 'react';
import { RefinerySidebar } from './RefinerySidebar';
import { RefineryFeed } from './RefineryFeed';
import { RefineryDrawer } from './RefineryDrawer';
import { useRefineryStore } from '@/store/useRefineryStore';

export function RefineryView() {
  const init = useRefineryStore((state) => state.init);
  const unlisten = useRefineryStore((state) => state.unlisten);

  useEffect(() => {
    init();
    return () => {
      unlisten();
    };
  }, []);

  return (
    <div className="h-full flex items-stretch bg-background relative overflow-hidden">
      <RefinerySidebar />

      <RefineryFeed />

      <RefineryDrawer />
    </div>
  );
}
