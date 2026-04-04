import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  DeviceConnectedPayload,
  DeviceDisconnectedPayload,
  ErrorPayload,
  FileProgressPayload,
  SendFileResponse,
  ServiceInfo,
  TransferDevice,
  TransferMessage,
  UrlMode,
} from '@/types/transfer';

const PLUGIN_PREFIX = 'plugin:ctxrun-plugin-transfer|';
let listenersInitInFlight = false;

interface TransferState {
  isRunning: boolean;
  isBusy: boolean;
  serviceInfo: ServiceInfo | null;
  urlMode: UrlMode;
  port: number | null;
  devices: TransferDevice[];
  selectedDeviceId: string | null;
  chatHistories: Record<string, TransferMessage[]>;
  lastError: string | null;
  _unlistenFns: UnlistenFn[];

  clearError: () => void;
  startService: () => Promise<void>;
  stopService: () => Promise<void>;
  selectDevice: (deviceId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  sendFile: (filePath: string) => Promise<void>;
  loadHistory: (deviceId: string) => Promise<void>;
  initListeners: () => Promise<void>;
  resetRuntime: () => void;
  unlisten: () => void;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function appendHistoryMessage(
  histories: Record<string, TransferMessage[]>,
  deviceId: string,
  message: TransferMessage
) {
  return {
    ...histories,
    [deviceId]: [...(histories[deviceId] ?? []), message],
  };
}

function upsertDevice(devices: TransferDevice[], nextDevice: TransferDevice) {
  const nextDevices = devices.filter((device) => device.id !== nextDevice.id);
  nextDevices.push(nextDevice);
  nextDevices.sort((left, right) => left.connectedAtMs - right.connectedAtMs);
  return nextDevices;
}

function basenameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function createLocalTextMessage(deviceId: string, content: string): TransferMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    deviceId,
    kind: 'text',
    direction: 'sent',
    content,
    timestampMs: Date.now(),
  };
}

function createLocalFileMessage(
  deviceId: string,
  response: SendFileResponse,
  filePath: string
): TransferMessage {
  return {
    id: response.fileId,
    deviceId,
    kind: 'file',
    direction: 'sent',
    fileId: response.fileId,
    fileName: response.fileName || basenameFromPath(filePath),
    fileSize: response.fileSize,
    status: 'pending',
    progressPercent: 0,
    timestampMs: Date.now(),
  };
}

function applyFileProgress(message: TransferMessage, progress: FileProgressPayload): TransferMessage {
  if (message.fileId !== progress.fileId) {
    return message;
  }

  return {
    ...message,
    fileName: progress.fileName,
    fileSize: progress.totalBytes,
    status: progress.status,
    progressPercent: progress.progressPercent,
    savedPath: progress.savedPath ?? message.savedPath,
  };
}

export const useTransferStore = create<TransferState>((set, get) => ({
  isRunning: false,
  isBusy: false,
  serviceInfo: null,
  urlMode: 'random',
  port: null,
  devices: [],
  selectedDeviceId: null,
  chatHistories: {},
  lastError: null,
  _unlistenFns: [],

  clearError: () => set({ lastError: null }),

  startService: async () => {
    if (get().isBusy || get().isRunning) return;

    await get().initListeners();
    set({ isBusy: true, lastError: null });

    try {
      const serviceInfo = await invoke<ServiceInfo>(`${PLUGIN_PREFIX}start_service`, {
        config: {
          urlMode: get().urlMode,
          port: get().port,
          pin: null,
          bindAddress: null,
          saveDir: null,
        },
      });

      set({
        isRunning: true,
        isBusy: false,
        serviceInfo,
        devices: [],
        selectedDeviceId: null,
        chatHistories: {},
        lastError: null,
      });
    } catch (error) {
      set({
        isBusy: false,
        lastError: toErrorMessage(error),
      });
    }
  },

  stopService: async () => {
    if (get().isBusy || !get().isRunning) return;

    set({ isBusy: true });
    try {
      await invoke(`${PLUGIN_PREFIX}stop_service`);
      get().resetRuntime();
    } catch (error) {
      set({
        isBusy: false,
        lastError: toErrorMessage(error),
      });
    }
  },

  selectDevice: async (deviceId) => {
    set({ selectedDeviceId: deviceId });
    await get().loadHistory(deviceId);
  },

  sendMessage: async (content) => {
    const deviceId = get().selectedDeviceId;
    const trimmed = content.trim();
    if (!deviceId || !trimmed) return;

    try {
      await invoke(`${PLUGIN_PREFIX}send_message`, {
        request: {
          deviceId,
          content: trimmed,
        },
      });

      const message = createLocalTextMessage(deviceId, trimmed);
      set((state) => ({
        chatHistories: appendHistoryMessage(state.chatHistories, deviceId, message),
      }));
    } catch (error) {
      set({ lastError: toErrorMessage(error) });
    }
  },

  sendFile: async (filePath) => {
    const deviceId = get().selectedDeviceId;
    if (!deviceId || !filePath) return;

    try {
      const response = await invoke<SendFileResponse>(`${PLUGIN_PREFIX}send_file`, {
        request: {
          deviceId,
          filePath,
        },
      });

      const message = createLocalFileMessage(deviceId, response, filePath);
      set((state) => ({
        chatHistories: appendHistoryMessage(state.chatHistories, deviceId, message),
      }));
    } catch (error) {
      set({ lastError: toErrorMessage(error) });
    }
  },

  loadHistory: async (deviceId) => {
    if (!deviceId) return;

    try {
      const history = await invoke<TransferMessage[]>(`${PLUGIN_PREFIX}get_chat_history`, {
        request: { deviceId },
      });
      set((state) => ({
        chatHistories: {
          ...state.chatHistories,
          [deviceId]: history,
        },
      }));
    } catch (error) {
      set({ lastError: toErrorMessage(error) });
    }
  },

  initListeners: async () => {
    if (get()._unlistenFns.length > 0 || listenersInitInFlight) return;
    listenersInitInFlight = true;

    try {
      const unlistenDeviceConnected = await listen<DeviceConnectedPayload>(
        'transfer:device-connected',
        (event) => {
          const device = event.payload.device;
          set((state) => ({
            devices: upsertDevice(state.devices, device),
            selectedDeviceId: state.selectedDeviceId ?? device.id,
          }));
          void get().loadHistory(device.id);
        }
      );

      const unlistenDeviceDisconnected = await listen<DeviceDisconnectedPayload>(
        'transfer:device-disconnected',
        (event) => {
          const disconnectedId = event.payload.deviceId;
          set((state) => {
            const nextDevices = state.devices.filter((device) => device.id !== disconnectedId);
            return {
              devices: nextDevices,
              selectedDeviceId:
                state.selectedDeviceId === disconnectedId
                  ? nextDevices[0]?.id ?? null
                  : state.selectedDeviceId,
            };
          });
        }
      );

      const unlistenMessageReceived = await listen<TransferMessage>(
        'transfer:message-received',
        (event) => {
          const message = event.payload;
          set((state) => ({
            chatHistories: appendHistoryMessage(state.chatHistories, message.deviceId, message),
          }));
        }
      );

      const unlistenFileReceived = await listen<TransferMessage>('transfer:file-received', (event) => {
        const message = event.payload;
        set((state) => ({
          chatHistories: appendHistoryMessage(state.chatHistories, message.deviceId, message),
        }));
      });

      const unlistenFileProgress = await listen<FileProgressPayload>(
        'transfer:file-progress',
        (event) => {
          const progress = event.payload;
          set((state) => {
            const history = state.chatHistories[progress.deviceId] ?? [];
            return {
              chatHistories: {
                ...state.chatHistories,
                [progress.deviceId]: history.map((message) =>
                  applyFileProgress(message, progress)
                ),
              },
            };
          });
        }
      );

      const unlistenServiceStopped = await listen('transfer:service-stopped', () => {
        get().resetRuntime();
      });

      const unlistenError = await listen<ErrorPayload>('transfer:error', (event) => {
        set({ lastError: event.payload.message });
      });

      set({
        _unlistenFns: [
          unlistenDeviceConnected,
          unlistenDeviceDisconnected,
          unlistenMessageReceived,
          unlistenFileReceived,
          unlistenFileProgress,
          unlistenServiceStopped,
          unlistenError,
        ],
      });
    } finally {
      listenersInitInFlight = false;
    }
  },

  resetRuntime: () =>
    set({
      isRunning: false,
      isBusy: false,
      serviceInfo: null,
      devices: [],
      selectedDeviceId: null,
      chatHistories: {},
    }),

  unlisten: () => {
    get()._unlistenFns.forEach((fn) => fn());
    set({ _unlistenFns: [] });
  },
}));
