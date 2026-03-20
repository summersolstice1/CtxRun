import { create } from 'zustand';
import {
  ExecApprovalChoice,
  ExecApprovalDecision,
  ExecApprovalPayload,
  ExecCommandRequest,
  PendingExecApproval,
} from '@/types/exec';

interface ExecApprovalState {
  pending?: PendingExecApproval;
  sessionAllowedCommands: string[];
  prefixAllowedRules: string[];
  resolver?: (value: ExecApprovalChoice) => void;
  ask: (payload: PendingExecApproval) => Promise<ExecApprovalChoice>;
  resolve: (value: ExecApprovalChoice) => void;
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizePrefixRule(rule: string[] | undefined): string {
  return (rule ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean).join(' ');
}

function commandMatchesPrefix(command: string, prefix: string): boolean {
  if (!prefix) return false;
  return normalizeCommand(command).startsWith(prefix);
}

function shouldAutoApprove(
  request: ExecCommandRequest,
  approval: ExecApprovalPayload,
  sessionAllowedCommands: string[],
  prefixAllowedRules: string[],
): ExecApprovalDecision | null {
  const normalizedCommand = normalizeCommand(request.command);
  if (sessionAllowedCommands.includes(normalizedCommand)) {
    return 'session';
  }

  const normalizedPrefix = normalizePrefixRule(approval.prefixRule);
  if (normalizedPrefix && prefixAllowedRules.some((rule) => rule === normalizedPrefix && commandMatchesPrefix(request.command, rule))) {
    return 'prefix_rule';
  }

  return null;
}

export const useExecApprovalStore = create<ExecApprovalState>((set, get) => ({
  pending: undefined,
  sessionAllowedCommands: [],
  prefixAllowedRules: [],
  resolver: undefined,
  ask: async (payload) => {
    const autoDecision = shouldAutoApprove(
      payload.request,
      payload.approval,
      get().sessionAllowedCommands,
      get().prefixAllowedRules,
    );
    if (autoDecision) {
      return autoDecision;
    }

    return new Promise<ExecApprovalChoice>((resolve) => {
      set({
        pending: payload,
        resolver: resolve,
      });
    });
  },
  resolve: (value) => {
    const { pending, resolver, sessionAllowedCommands, prefixAllowedRules } = get();
    if (pending && typeof value === 'string') {
      const normalizedCommand = normalizeCommand(pending.request.command);
      const normalizedPrefix = normalizePrefixRule(pending.approval.prefixRule);
      set({
        sessionAllowedCommands:
          value === 'session' && !sessionAllowedCommands.includes(normalizedCommand)
            ? [...sessionAllowedCommands, normalizedCommand]
            : sessionAllowedCommands,
        prefixAllowedRules:
          value === 'prefix_rule' && normalizedPrefix && !prefixAllowedRules.includes(normalizedPrefix)
            ? [...prefixAllowedRules, normalizedPrefix]
            : prefixAllowedRules,
      });
    }

    resolver?.(value);
    set({
      pending: undefined,
      resolver: undefined,
    });
  },
}));
