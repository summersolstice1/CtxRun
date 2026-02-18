import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { PlayCircle, StopCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const StartNode = memo(() => {
  const { t } = useTranslation();
  return (
    <div className="px-5 py-2.5 shadow-lg rounded-full bg-emerald-500 border-2 border-emerald-600 text-white flex items-center gap-2 min-w-[120px] justify-center">
      <PlayCircle size={18} className="animate-pulse" />
      <span className="text-xs font-bold uppercase tracking-[0.1em]">{t('automator.startNode')}</span>
      {/* 只有输出桩，禁止输入 */}
      <Handle type="source" position={Position.Bottom} className="!bg-white !w-3 !h-3 border-2 border-emerald-600" />
    </div>
  );
});

export const EndNode = memo(() => {
  const { t } = useTranslation();
  return (
    <div className="px-5 py-2.5 shadow-lg rounded-full bg-rose-500 border-2 border-rose-600 text-white flex items-center gap-2 min-w-[120px] justify-center">
      <StopCircle size={18} />
      <span className="text-xs font-bold uppercase tracking-[0.1em]">{t('automator.endNode')}</span>
      {/* 只有输入桩，禁止输出 */}
      <Handle type="target" position={Position.Top} className="!bg-white !w-3 !h-3 border-2 border-rose-600" />
    </div>
  );
});
