import { useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import { Toast, type ToastType } from '@/components/ui/Toast';
import { useTransferStore } from '@/store/useTransferStore';
import { ServiceControls } from './ServiceControls';
import { DeviceSidebar } from './DeviceSidebar';
import { ChatPanel } from './ChatPanel';

export function TransferView() {
  const [
    isRunning,
    isBusy,
    serviceInfo,
    devices,
    selectedDeviceId,
    chatHistories,
    lastError,
    clearError,
    startService,
    stopService,
    selectDevice,
    sendMessage,
    sendFile,
    initListeners,
  ] = useTransferStore(
    useShallow((state) => [
      state.isRunning,
      state.isBusy,
      state.serviceInfo,
      state.devices,
      state.selectedDeviceId,
      state.chatHistories,
      state.lastError,
      state.clearError,
      state.startService,
      state.stopService,
      state.selectDevice,
      state.sendMessage,
      state.sendFile,
      state.initListeners,
    ])
  );

  const [copied, setCopied] = useState(false);
  const [toastState, setToastState] = useState<{ show: boolean; message: string; type: ToastType }>({
    show: false,
    message: '',
    type: 'info',
  });

  useEffect(() => {
    void initListeners();
  }, []);

  useEffect(() => {
    if (!lastError) return;
    setToastState({
      show: true,
      message: lastError,
      type: 'error',
    });
    clearError();
  }, [lastError, clearError]);

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const messages = selectedDeviceId ? chatHistories[selectedDeviceId] ?? [] : [];

  const handleCopyUrl = async () => {
    if (!serviceInfo?.url) return;

    try {
      await writeText(serviceInfo.url);
      setCopied(true);
      setToastState({ show: true, message: serviceInfo.url, type: 'success' });
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      setToastState({
        show: true,
        message: String(error),
        type: 'error',
      });
    }
  };

  const handleAttachFile = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
      });
      if (typeof selected === 'string') {
        await sendFile(selected);
      }
    } catch (error) {
      setToastState({ show: true, message: String(error), type: 'error' });
    }
  };

  const handleOpenFolder = async (path: string) => {
    try {
      await invoke('open_folder_in_file_manager', { path });
    } catch (error) {
      setToastState({ show: true, message: String(error), type: 'error' });
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#040b16] text-foreground animate-in fade-in duration-300">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_30%),linear-gradient(180deg,#071120_0%,#040b16_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div className="relative flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-5">
        <ServiceControls
          isRunning={isRunning}
          isBusy={isBusy}
          serviceInfo={serviceInfo}
          copied={copied}
          devicesCount={devices.length}
          onStart={() => void startService()}
          onStop={() => void stopService()}
          onCopyUrl={() => void handleCopyUrl()}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
          <DeviceSidebar
            isRunning={isRunning}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelect={(deviceId) => void selectDevice(deviceId)}
          />

          <ChatPanel
            isRunning={isRunning}
            isBusy={isBusy}
            selectedDevice={selectedDevice}
            messages={messages}
            onSendMessage={sendMessage}
            onAttachFile={handleAttachFile}
            onOpenFolder={handleOpenFolder}
          />
        </div>
      </div>

      <Toast
        show={toastState.show}
        message={toastState.message}
        type={toastState.type}
        onDismiss={() => setToastState((state) => ({ ...state, show: false }))}
      />
    </div>
  );
}
