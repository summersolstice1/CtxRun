import { create } from 'zustand';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  EXEC_PLUGIN_PREFIX,
  ExecExitEvent,
  ExecOutputEvent,
  ExecSessionRecord,
  ExecSessionSnapshot,
  ExecStateEvent,
} from '@/types/exec';

const OUTPUT_CHAR_CAP = 16_000;
let listenersInitInFlight = false;
const completionResolvers = new Map<string, Array<(session: ExecSessionRecord) => void>>();

function appendCapped(base: string, delta: string, cap = OUTPUT_CHAR_CAP): string {
  const next = `${base}${delta}`;
  if (next.length <= cap) return next;
  return next.slice(next.length - cap);
}

function isTerminalState(state: ExecSessionRecord['state']): boolean {
  return state === 'completed' || state === 'failed' || state === 'terminated';
}

interface ExecStoreState {
  sessions: Record<string, ExecSessionRecord>;
  toolCallToSessionId: Record<string, string>;
  pendingByToolCallId: Record<string, { command: string; workdir: string; reason: string }>;
  _unlistenFns: UnlistenFn[];
  initListeners: () => Promise<void>;
  registerSession: (session: ExecSessionSnapshot) => void;
  markPendingApproval: (toolCallId: string, payload: { command: string; workdir: string; reason: string }) => void;
  clearPendingApproval: (toolCallId: string) => void;
  awaitCompletion: (sessionId: string) => Promise<ExecSessionRecord>;
  terminateSession: (sessionId: string) => Promise<void>;
  unlisten: () => void;
}

function resolveCompletion(session: ExecSessionRecord) {
  const resolvers = completionResolvers.get(session.id);
  if (!resolvers) return;
  completionResolvers.delete(session.id);
  resolvers.forEach((resolve) => resolve(session));
}

export const useExecStore = create<ExecStoreState>((set, get) => ({
  sessions: {},
  toolCallToSessionId: {},
  pendingByToolCallId: {},
  _unlistenFns: [],
  initListeners: async () => {
    if (get()._unlistenFns.length > 0 || listenersInitInFlight) return;
    listenersInitInFlight = true;
    try {
      const unlistenOutput = await listen<ExecOutputEvent>('exec://output', (event) => {
        const payload = event.payload;
        set((state) => {
          const existing = state.sessions[payload.sessionId];
          const base: ExecSessionRecord =
            existing ?? {
              id: payload.sessionId,
              toolCallId: payload.toolCallId,
              command: '',
              workdir: '',
              state: 'running',
              stdoutPreview: '',
              stderrPreview: '',
              startedAtMs: Date.now(),
              updatedAtMs: Date.now(),
              stdout: '',
              stderr: '',
              combinedOutput: '',
            };
          const nextSession: ExecSessionRecord = {
            ...base,
            stdout:
              payload.stream === 'stdout'
                ? appendCapped(base.stdout, payload.text)
                : base.stdout,
            stderr:
              payload.stream === 'stderr'
                ? appendCapped(base.stderr, payload.text)
                : base.stderr,
            stdoutPreview:
              payload.stream === 'stdout'
                ? appendCapped(base.stdoutPreview, payload.text)
                : base.stdoutPreview,
            stderrPreview:
              payload.stream === 'stderr'
                ? appendCapped(base.stderrPreview, payload.text)
                : base.stderrPreview,
            combinedOutput: appendCapped(base.combinedOutput, payload.text, OUTPUT_CHAR_CAP * 4),
            updatedAtMs: Date.now(),
          };
          return {
            sessions: {
              ...state.sessions,
              [payload.sessionId]: nextSession,
            },
            toolCallToSessionId:
              payload.toolCallId && !state.toolCallToSessionId[payload.toolCallId]
                ? {
                    ...state.toolCallToSessionId,
                    [payload.toolCallId]: payload.sessionId,
                  }
                : state.toolCallToSessionId,
          };
        });
      });

      const unlistenState = await listen<ExecStateEvent>('exec://state', (event) => {
        const payload = event.payload;
        set((state) => {
          const existing = state.sessions[payload.sessionId];
          const base: ExecSessionRecord =
            existing ?? {
              id: payload.sessionId,
              toolCallId: payload.toolCallId,
              command: '',
              workdir: '',
              state: payload.state,
              stdoutPreview: '',
              stderrPreview: '',
              startedAtMs: Date.now(),
              updatedAtMs: Date.now(),
              stdout: '',
              stderr: '',
              combinedOutput: '',
            };
          return {
            sessions: {
              ...state.sessions,
              [payload.sessionId]: {
                ...base,
                state: payload.state,
                updatedAtMs: Date.now(),
              },
            },
            toolCallToSessionId:
              payload.toolCallId && !state.toolCallToSessionId[payload.toolCallId]
                ? {
                    ...state.toolCallToSessionId,
                    [payload.toolCallId]: payload.sessionId,
                  }
                : state.toolCallToSessionId,
          };
        });
      });

      const unlistenExit = await listen<ExecExitEvent>('exec://exit', (event) => {
        const payload = event.payload;
        set((state) => {
          const existing = state.sessions[payload.sessionId];
          const base: ExecSessionRecord =
            existing ?? {
              id: payload.sessionId,
              toolCallId: payload.toolCallId,
              command: '',
              workdir: '',
              state: payload.state,
              stdoutPreview: '',
              stderrPreview: '',
              startedAtMs: Date.now(),
              updatedAtMs: Date.now(),
              stdout: '',
              stderr: '',
              combinedOutput: '',
            };
          const nextSession: ExecSessionRecord = {
            ...base,
            state: payload.state,
            exitCode: payload.exitCode,
            stdoutPreview: payload.stdoutPreview,
            stderrPreview: payload.stderrPreview,
            stdout: payload.stdoutPreview,
            stderr: payload.stderrPreview,
            combinedOutput: base.combinedOutput || [payload.stdoutPreview, payload.stderrPreview].filter(Boolean).join('\n'),
            durationMs: payload.durationMs,
            updatedAtMs: Date.now(),
          };
          resolveCompletion({ ...nextSession });
          return {
            sessions: {
              ...state.sessions,
              [payload.sessionId]: nextSession,
            },
            toolCallToSessionId:
              payload.toolCallId && !state.toolCallToSessionId[payload.toolCallId]
                ? {
                    ...state.toolCallToSessionId,
                    [payload.toolCallId]: payload.sessionId,
                  }
                : state.toolCallToSessionId,
          };
        });
      });

      set({
        _unlistenFns: [unlistenOutput, unlistenState, unlistenExit],
      });
    } finally {
      listenersInitInFlight = false;
    }
  },
  registerSession: (session) =>
    set((state) => {
      const existing = state.sessions[session.id];
      const keepExistingTerminal = existing && isTerminalState(existing.state);
      return {
        sessions: {
          ...state.sessions,
          [session.id]: {
            ...existing,
            ...session,
            state: keepExistingTerminal ? existing.state : session.state,
            exitCode: keepExistingTerminal ? existing.exitCode : session.exitCode,
            stdoutPreview: existing?.stdoutPreview || session.stdoutPreview,
            stderrPreview: existing?.stderrPreview || session.stderrPreview,
            stdout: existing?.stdout ?? session.stdoutPreview,
            stderr: existing?.stderr ?? session.stderrPreview,
            combinedOutput:
              existing?.combinedOutput ?? [session.stdoutPreview, session.stderrPreview].filter(Boolean).join('\n'),
            durationMs: existing?.durationMs,
          },
        },
        toolCallToSessionId: session.toolCallId
          ? {
              ...state.toolCallToSessionId,
              [session.toolCallId]: session.id,
            }
          : state.toolCallToSessionId,
      };
    }),
  markPendingApproval: (toolCallId, payload) =>
    set((state) => ({
      pendingByToolCallId: {
        ...state.pendingByToolCallId,
        [toolCallId]: payload,
      },
    })),
  clearPendingApproval: (toolCallId) =>
    set((state) => {
      if (!state.pendingByToolCallId[toolCallId]) return state;
      const next = { ...state.pendingByToolCallId };
      delete next[toolCallId];
      return { pendingByToolCallId: next };
    }),
  awaitCompletion: async (sessionId) => {
    const existing = get().sessions[sessionId];
    if (existing && isTerminalState(existing.state)) {
      return existing;
    }

    return new Promise<ExecSessionRecord>((resolve) => {
      const list = completionResolvers.get(sessionId) ?? [];
      list.push(resolve);
      completionResolvers.set(sessionId, list);
    });
  },
  terminateSession: async (sessionId) => {
    await invoke(`${EXEC_PLUGIN_PREFIX}terminate_exec`, {
      request: { sessionId },
    });
  },
  unlisten: () => {
    get()._unlistenFns.forEach((unlisten) => unlisten());
    set({ _unlistenFns: [] });
  },
}));
