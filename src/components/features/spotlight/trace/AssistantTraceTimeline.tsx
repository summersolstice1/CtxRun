import { ChatAssistantTraceItem, ChatToolCallTrace } from '@/lib/llm';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { ExecSessionCard } from '@/components/features/spotlight/exec/ExecSessionCard';
import { ToolCallInlineBlock } from '@/components/features/spotlight/trace/ToolCallInlineBlock';

interface AssistantTraceTimelineProps {
  trace: ChatAssistantTraceItem[];
  toolCalls: ChatToolCallTrace[];
  onOpenLink: (href: unknown) => void;
}

export function AssistantTraceTimeline({
  trace,
  toolCalls,
  onOpenLink,
}: AssistantTraceTimelineProps) {
  if (trace.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {trace.map((item) => {
        if (item.type === 'reasoning') {
          return (
            <MarkdownContent
              key={item.id}
              content={item.content}
              variant="chat"
              linkClassName="text-purple-300 hover:text-purple-200"
              onOpenLink={onOpenLink}
              showExternalIndicator
            />
          );
        }

        const toolCall = toolCalls.find((call) => call.id === item.toolCallId);
        if (!toolCall) {
          return null;
        }

        return toolCall.name === 'shell_command' ? (
          <ExecSessionCard key={item.id} toolCallId={toolCall.id} call={toolCall} />
        ) : (
          <ToolCallInlineBlock key={item.id} call={toolCall} />
        );
      })}
    </div>
  );
}
