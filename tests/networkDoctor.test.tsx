import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkDoctor } from '@/components/features/monitor/tabs/NetworkDoctor';
import { NetworkDiagnosticsReport } from '@/types/monitor';

const { invokeMock, runMlabSpeedTestMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  runMlabSpeedTestMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/components/features/monitor/network/mlabSpeedTest', () => ({
  runMlabSpeedTest: runMlabSpeedTestMock,
}));

const report: NetworkDiagnosticsReport = {
  summary: {
    overall_status: 'healthy',
    healthy_count: 4,
    degraded_count: 1,
    offline_count: 1,
    issue_codes: ['packet_loss'],
  },
  ping: {
    target: '1.1.1.1',
    status: 'degraded',
    sent: 6,
    received: 5,
    loss_percent: 16.7,
    min_ms: 12,
    avg_ms: 28,
    max_ms: 41,
    jitter_ms: 8,
  },
  probes: [
    {
      id: 'github',
      name: 'GitHub',
      category: 'developer',
      url: 'https://github.com',
      host: 'github.com',
      status: 'healthy',
      dns_ms: 25,
      tcp_ms: 40,
      http_ms: 120,
      total_ms: 185,
      status_code: 200,
      ip_addresses: ['140.82.114.3'],
      observations: [],
    },
  ],
};

describe('NetworkDoctor', () => {
  beforeEach(() => {
    invokeMock.mockReset().mockImplementation((command: string, payload?: Record<string, unknown>) => {
      if (command === 'diagnose_network') {
        return Promise.resolve(report);
      }
      if (command === 'probe_network_target') {
        return Promise.resolve({
          ...report.probes[0],
          id: 'custom-api',
          name: String(payload?.url ?? 'custom'),
          category: 'custom',
          url: String(payload?.url ?? 'https://custom.example'),
          host: 'custom.example',
        });
      }
      return Promise.reject(new Error(`Unhandled command ${command}`));
    });
    runMlabSpeedTestMock.mockReset().mockImplementation(async (callbacks?: { onMeasurement?: (snapshot: any) => void }) => {
      callbacks?.onMeasurement?.({
        phase: 'download',
        downloadMbps: 88.12,
        uploadMbps: null,
        serverLabel: 'mlab1',
        serverLocation: 'Hong Kong, CN',
      });
      callbacks?.onMeasurement?.({
        phase: 'upload',
        downloadMbps: 123.45,
        uploadMbps: 56.78,
        serverLabel: 'mlab1',
        serverLocation: 'Hong Kong, CN',
      });

      return {
        phase: 'complete',
        returnCode: 0,
        downloadMbps: 123.45,
        uploadMbps: 56.78,
        serverLabel: 'mlab1',
        serverLocation: 'Hong Kong, CN',
      };
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders structured diagnostics from the backend report', async () => {
    render(<NetworkDoctor />);

    fireEvent.click(screen.getByRole('button', { name: 'monitor.netDetailedProbes' }));
    expect(await screen.findByText('GitHub')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'monitor.netDetailedProbes' })).toBeTruthy();
    expect(invokeMock).toHaveBeenCalledWith('diagnose_network');
  });

  it('requires policy consent before starting the public speed test', async () => {
    render(<NetworkDoctor />);

    fireEvent.click(screen.getByText('monitor.netRunSpeedTest'));
    expect(runMlabSpeedTestMock).not.toHaveBeenCalled();
    expect(await screen.findByText('monitor.netConsentRequired')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('monitor.netRunSpeedTest'));

    await waitFor(() => {
      expect(runMlabSpeedTestMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('img', { name: 'monitor.netRealtimeChart' })).toBeTruthy();
  });

  it('probes a custom target through the dedicated backend command', async () => {
    render(<NetworkDoctor />);
    fireEvent.click(screen.getByRole('button', { name: 'monitor.netDetailedProbes' }));
    await screen.findByText('GitHub');

    fireEvent.change(screen.getByPlaceholderText('monitor.netCustomTargetPlaceholder'), {
      target: { value: 'https://custom.example/health' },
    });
    fireEvent.click(screen.getByText('monitor.netCustomTargetProbe'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('probe_network_target', {
        url: 'https://custom.example/health',
      });
    });

    expect(await screen.findByText('https://custom.example/health')).toBeTruthy();
  });
});
