import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, Layers } from 'lucide-react';
import { RefineryItemUI } from '@/types/refinery';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

interface FeedCardProps {
  item: RefineryItemUI;
  isActive: boolean;
  onClick: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
  extraBadge?: React.ReactNode;
  className?: string;
}

interface BundleCardPropsExtended {
  items: RefineryItemUI[];
  activeId: string | null;
  onItemClick: (id: string) => void;
  onTogglePin: (id: string) => void;
  FeedCardComponent: React.ComponentType<FeedCardProps>;
}

export function BundleCard({ items, activeId, onItemClick, onTogglePin, FeedCardComponent }: BundleCardPropsExtended) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { language } = useAppStore();

  const coverItem = items[0];
  const count = items.length;

  const handleCoverClick = () => {
    setIsExpanded(true);
  };

  const handleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(false);
  };

  return (
    // 关键：外层容器使用 relative 但不设置 z-index（默认为 auto）
    // 这样 BundleCard 作为一个整体在主层叠上下文中，不会与日期标题竞争
    // 内部的 absolute 元素相对于外层容器定位，z 值只在内部比较
    <div className={cn(
      "relative transition-all duration-300",
      isExpanded ? "mb-4" : "mb-10"
    )}>

      {/* --- 折叠态 (堆叠效果) --- */}
      {!isExpanded && (
        <div
          onClick={handleCoverClick}
          className="group relative z-0 cursor-pointer select-none"
        >
          {/* Layer 3 (最底层) - 偏移量很大 */}
          <div className={cn(
            "absolute left-0 w-full h-full rounded-xl z-0",
            // 稍微调深一点颜色，增加质感
            "bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-sky-500/20",
            "border border-indigo-500/30",
            "shadow-md",
            "transform transition-all duration-300 ease-out",
            // 默认向下偏移 8 (32px)
            "translate-y-8 scale-[0.90]",
            // Hover 时继续向下探
            "group-hover:translate-y-9"
          )} />

          {/* Layer 2 (中间层) */}
          <div className={cn(
            "absolute left-0 w-full h-full rounded-xl z-10",
            "bg-gradient-to-br from-secondary via-secondary/90 to-muted",
            "border border-border/80",
            "shadow-sm",
            "transform transition-all duration-300 ease-out",
            "translate-y-4 scale-[0.95]",
            "group-hover:translate-y-5"
          )} />

          {/* Layer 1 (顶层真实内容) */}
          <div className="relative z-20 transform transition-all duration-300 ease-out group-hover:-translate-y-1">
            <FeedCardComponent
              item={coverItem}
              isActive={false}
              onClick={handleCoverClick}
              onTogglePin={(e) => { e.stopPropagation(); onTogglePin(coverItem.id); }}
              className="mb-0 shadow-lg border-border ring-1 ring-black/5 dark:ring-white/5" 
              extraBadge={
                <span className="flex items-center gap-1 text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full ml-2 shadow-sm">
                  <Layers size={10} /> {count}
                </span>
              }
            />
          </div>
        </div>
      )}

      {/* --- 展开态 (列表模式) --- */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative"
          >
            {/* 左侧连接线装饰 */}
            <div className="absolute top-3 bottom-3 left-[-12px] w-0.5 bg-gradient-to-b from-primary/30 to-transparent rounded-full" />

            {/* 头部控制栏 */}
            <div className="flex justify-between items-center mb-3 pl-1 pr-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md border border-border/50">
                <Layers size={12} className="text-primary" />
                {items[0].sourceApp || 'Unknown'} Group ({count})
              </span>
              <button
                onClick={handleCollapse}
                className="flex items-center gap-1 text-[10px] bg-secondary hover:bg-secondary/80 text-foreground px-2 py-1 rounded transition-colors shadow-sm border border-border"
              >
                {language === 'zh' ? '收起' : 'Collapse'} <ChevronUp size={10} />
              </button>
            </div>

            {/* 列表内容 */}
            <div className="space-y-3">
              {items.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ 
                    duration: 0.3, 
                    delay: index * 0.05, 
                    type: "spring",
                    stiffness: 300,
                    damping: 25
                  }}
                >
                  <FeedCardComponent
                    item={item}
                    isActive={activeId === item.id}
                    onClick={() => onItemClick(item.id)}
                    onTogglePin={(e) => { e.stopPropagation(); onTogglePin(item.id); }}
                    className="mb-0" 
                  />
                </motion.div>
              ))}
            </div>

            {/* 底部收起条 */}
            {items.length > 2 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                onClick={handleCollapse}
                className="h-6 mt-3 flex items-center justify-center cursor-pointer hover:bg-secondary/50 rounded-lg transition-colors text-muted-foreground/40 hover:text-primary/80 group border border-transparent hover:border-border/50"
              >
                <ChevronUp size={14} className="transition-transform group-hover:-translate-y-0.5" />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}