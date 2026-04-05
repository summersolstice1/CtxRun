import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, Layers } from 'lucide-react';
import { RefineryItemUI } from '@/types/refinery';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface FeedCardProps {
  item: RefineryItemUI;
  isActive: boolean;
  onClick: () => void; // 这里定义是不带参数的
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

// 修复点 2: 添加 as const，确保类型被锁定为字面量 "spring"
const transitionConfig = {
  type: "spring",
  stiffness: 400,
  damping: 30,
  restDelta: 0.01
} as const;

export function BundleCard({ items, activeId, onItemClick, onTogglePin, FeedCardComponent }: BundleCardPropsExtended) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useTranslation();

  const coverItem = items[0];
  const count = items.length;

  // 这里的 e: React.MouseEvent 仅在当前组件内部处理逻辑
  const handleToggle = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <motion.div 
      layout
      initial={false}
      className={cn(
        "relative w-full overflow-visible transition-all duration-300",
        isExpanded ? "mb-6" : "mb-12"
      )}
    >
      <AnimatePresence>
        {!isExpanded && (
          <div className="absolute inset-0 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: 12, scale: 0.96 }}
              exit={{ opacity: 0, y: 0 }}
              className="absolute inset-0 bg-secondary/80 border border-border/60 rounded-xl z-[5]"
            />
            <motion.div
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: 24, scale: 0.92 }}
              exit={{ opacity: 0, y: 0 }}
              className="absolute inset-0 bg-secondary/40 border border-border/40 rounded-xl z-[0]"
            />
          </div>
        )}
      </AnimatePresence>

      <div className="relative z-10">
        {!isExpanded ? (
          <motion.div
            key="cover"
            initial={false}
            whileHover={{ y: -2 }}
            onClick={() => handleToggle()} // 修复点 1: 包装一层，不传递事件对象
            className="cursor-pointer active:scale-[0.99] transition-transform"
          >
            <FeedCardComponent
              item={coverItem}
              isActive={false}
              onClick={() => handleToggle()} // 修复点 1: 确保符合 () => void 签名
              onTogglePin={(e) => { e.stopPropagation(); onTogglePin(coverItem.id); }}
              extraBadge={
                <span className="flex items-center gap-1 text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full ml-2">
                  <Layers size={10} /> {count}
                </span>
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            className="flex flex-col gap-3"
          >
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-between items-center px-1 mb-1"
            >
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <Layers size={12} className="text-primary" />
                {items[0].sourceApp || 'Unknown'} · {count} Items
              </span>
              <button
                onClick={() => handleToggle()} // 包装一层
                className="p-1 hover:bg-secondary rounded-md text-muted-foreground transition-colors"
              >
                <ChevronUp size={16} />
              </button>
            </motion.div>

            {items.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  transition: { ...transitionConfig, delay: index * 0.03 } 
                }}
                style={{ willChange: "transform, opacity" }}
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

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => handleToggle()} // 包装一层
              className="py-2 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors flex items-center justify-center gap-1 uppercase font-bold"
            >
              <ChevronUp size={12} /> {t('refinery.collapse')}
            </motion.button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}