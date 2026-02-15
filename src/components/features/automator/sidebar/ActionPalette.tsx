import { MousePointerClick, Move, Type, Clock, Keyboard, PlayCircle, StopCircle, Eye } from 'lucide-react';
import { DragEvent } from 'react';
import { cn } from '@/lib/utils';

export function ActionPalette() {
  // 1. 官方标准写法：只存 Type，或者存简单的 JSON 字符串
  const onDragStart = (event: DragEvent, nodeType: string, payload: any) => {
    // 这里的 key 'application/reactflow' 是自定义的，两边对上就行
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/payload', JSON.stringify(payload));
    event.dataTransfer.effectAllowed = 'move';
  };

  const DraggableItem = ({ type, label, icon: Icon, payload }: any) => {
    return (
      <div
        className={cn(
          "flex items-center gap-3 p-3 bg-card border border-border rounded-lg cursor-grab",
          "hover:border-primary/50 hover:shadow-sm transition-all active:cursor-grabbing select-none"
        )}
        draggable // <--- 核心：必须开启
        onDragStart={(event) => onDragStart(event, type, payload)}
      >
        <div className="p-1.5 bg-secondary rounded-md text-foreground/70">
          <Icon size={16} />
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
    );
  };

  return (
    <div className="w-64 border-r border-border bg-secondary/5 flex flex-col h-full z-20">
      <div className="p-4 border-b border-border">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Action Library</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="text-[10px] text-muted-foreground font-semibold mb-2 mt-1">SYSTEM</div>
        <DraggableItem type="startNode" label="Start Point" icon={PlayCircle} payload={{}} />
        <DraggableItem type="endNode" label="End Point" icon={StopCircle} payload={{}} />

        <div className="text-[10px] text-muted-foreground font-semibold mb-2 mt-1">MOUSE</div>
        <DraggableItem type="Click" label="Click" icon={MousePointerClick} payload={{ button: 'Left' }} />
        <DraggableItem type="DoubleClick" label="Double Click" icon={MousePointerClick} payload={{ button: 'Left' }} />
        <DraggableItem type="MoveTo" label="Move Mouse" icon={Move} payload={{ x: 0, y: 0 }} />

        <div className="text-[10px] text-muted-foreground font-semibold mb-2 mt-4">KEYBOARD</div>
        <DraggableItem type="Type" label="Input Text" icon={Type} payload={{ text: '' }} />
        <DraggableItem type="KeyPress" label="Press Key" icon={Keyboard} payload={{ key: 'Enter' }} />

        <div className="text-[10px] text-muted-foreground font-semibold mb-2 mt-4">FLOW</div>
        <DraggableItem type="Wait" label="Wait / Sleep" icon={Clock} payload={{ ms: 1000 }} />

        <div className="text-[10px] text-muted-foreground font-semibold mb-2 mt-4">CONDITION</div>
        <DraggableItem type="conditionNode" label="Check Color" icon={Eye} payload={{ x: 0, y: 0, expectedHex: '#00FF00', tolerance: 10 }} />
      </div>
    </div>
  );
}