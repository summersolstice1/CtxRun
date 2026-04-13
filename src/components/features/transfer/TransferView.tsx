import { useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { Toast, type ToastType } from '@/components/ui/Toast';
import { useTransferStore } from '@/store/useTransferStore';
import { usePreviewStore } from '@/store/usePreviewStore';
import { ServiceControls } from './ServiceControls';
import { DeviceSidebar } from './DeviceSidebar';
import { ChatPanel } from './ChatPanel';

export function TransferView() {
  const { t } = useTranslation();
  const openPreview = usePreviewStore((state) => state.openPreview);
  const [
    isRunning, isBusy, serviceInfo, devices, pendingDevices, selectedDeviceId, chatHistories,
    lastError, clearError, startService, stopService, selectDevice, sendMessage, sendFile,
    respondFileRequest, respondConnectionRequest, initListeners,
  ] = useTransferStore(
    useShallow((state) => [
      state.isRunning, state.isBusy, state.serviceInfo, state.devices, state.pendingDevices,
      state.selectedDeviceId, state.chatHistories, state.lastError, state.clearError,
      state.startService, state.stopService, state.selectDevice, state.sendMessage,
      state.sendFile, state.respondFileRequest, state.respondConnectionRequest, state.initListeners,
    ])
  );

  const [copied, setCopied] = useState(false);
  const [toastState, setToastState] = useState<{ show: boolean; message: string; type: ToastType }>({
    show: false, message: '', type: 'info',
  });

  useEffect(() => {
    void initListeners();
  }, []);

  useEffect(() => {
    if (!lastError) return;
    setToastState({ show: true, message: lastError, type: 'error' });
    clearError();
  }, [lastError, clearError]);

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const messages = selectedDeviceId ? chatHistories[selectedDeviceId] ?? [] : [];

  const handleCopyUrl = async () => {
    if (!serviceInfo?.url) return;
    try {
      await writeText(serviceInfo.url);
      setCopied(true);
      setToastState({ show: true, message: t('transfer.copied'), type: 'success' });
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      setToastState({ show: true, message: String(error), type: 'error' });
    }
  };

  const handleAttachFile = async () => {
    try {
      const selected = await openDialog({ multiple: false, directory: false });
      if (typeof selected === 'string') await sendFile(selected);
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
    <div className="flex h-full min-h-0 overflow-hidden bg-background text-foreground animate-in fade-in duration-300">
      {/* 左侧边栏：服务控制 + 设备列表 */}
      <div className="w-64 xl:w-72 flex flex-col border-r border-border bg-secondary/10 shrink-0">
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
        <DeviceSidebar
          isRunning={isRunning}
          devices={devices}
          pendingDevices={pendingDevices}
          selectedDeviceId={selectedDeviceId}
          onSelect={(deviceId) => void selectDevice(deviceId)}
          onRespondConnection={(deviceId, accept) => void respondConnectionRequest(deviceId, accept)}
        />
      </div>

      {/* 右侧主区域：聊天面板 */}
      <div className="flex-1 flex min-w-0 bg-background">
        <ChatPanel
          isRunning={isRunning}
          isBusy={isBusy}
          selectedDevice={selectedDevice}
          messages={messages}
          onSendMessage={sendMessage}
          onAttachFile={handleAttachFile}
          onOpenFolder={handleOpenFolder}
          onPreviewFile={openPreview}
          onRespondFileRequest={respondFileRequest}
        />
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
