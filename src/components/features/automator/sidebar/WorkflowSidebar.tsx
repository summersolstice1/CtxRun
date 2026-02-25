import { useState } from 'react';
import { useAutomatorStore } from '@/store/useAutomatorStore';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreVertical,
  Copy,
  Trash2,
  Edit2,
  Check,
  X,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function WorkflowSidebar() {
  const { t } = useTranslation();
  const {
    workflows,
    activeWorkflowId,
    createWorkflow,
    deleteWorkflow,
    duplicateWorkflow,
    renameWorkflow,
    switchWorkflow,
  } = useAutomatorStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleStartEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleSaveEdit = () => {
    if (editingId && editingName.trim()) {
      renameWorkflow(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = (id: string) => {
    if (workflows.length === 1) {
      // Don't allow deleting the last workflow
      return;
    }
    if (confirm(t('automator.confirmDeleteWorkflow'))) {
      deleteWorkflow(id);
    }
  };

  return (
    <div className="flex flex-col h-full border-r bg-background/50">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">{t('automator.workflows')}</h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => createWorkflow()}
        >
          <Plus size={16} />
        </Button>
      </div>

      {/* Workflow List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {workflows.map((workflow) => (
            <div
              key={workflow.id}
              className={cn(
                'group relative rounded-md transition-colors',
                activeWorkflowId === workflow.id
                  ? 'bg-accent'
                  : 'hover:bg-accent/50'
              )}
            >
              {editingId === workflow.id ? (
                // Edit mode
                <div className="flex items-center gap-1 p-2">
                  <Input
                    value={editingName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingName(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    className="h-7 text-sm"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={handleSaveEdit}
                  >
                    <Check size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={handleCancelEdit}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ) : (
                // View mode
                <div className="flex items-center gap-2">
                  <button
                    className="flex-1 flex items-center gap-2 p-2 text-left text-sm"
                    onClick={() => switchWorkflow(workflow.id)}
                  >
                    <FileText size={14} className="shrink-0 opacity-60" />
                    <span className="truncate">{workflow.name}</span>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleStartEdit(workflow.id, workflow.name)}
                      >
                        <Edit2 size={14} className="mr-2" />
                        {t('common.rename')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => duplicateWorkflow(workflow.id)}
                      >
                        <Copy size={14} className="mr-2" />
                        {t('common.duplicate')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDelete(workflow.id)}
                        disabled={workflows.length === 1}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 size={14} className="mr-2" />
                        {t('common.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer Info */}
      <div className="p-3 border-t text-xs text-muted-foreground">
        {workflows.length} {t('automator.workflowCount')}
      </div>
    </div>
  );
}
