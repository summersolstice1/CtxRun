import ndt7 from '@m-lab/ndt7';
import downloadWorkerUrl from '@m-lab/ndt7/src/ndt7-download-worker.js?url';
import uploadWorkerUrl from '@m-lab/ndt7/src/ndt7-upload-worker.js?url';

export type SpeedTestPhase =
  | 'idle'
  | 'discovering'
  | 'download'
  | 'upload'
  | 'complete'
  | 'error';

export interface SpeedTestSnapshot {
  phase: SpeedTestPhase;
  downloadMbps: number | null;
  uploadMbps: number | null;
  serverLabel: string | null;
  serverLocation: string | null;
}

interface SpeedTestResult extends SpeedTestSnapshot {
  returnCode: number;
}

interface SpeedTestCallbacks {
  onPhaseChange?: (phase: SpeedTestPhase) => void;
  onMeasurement?: (snapshot: SpeedTestSnapshot) => void;
}

export async function runMlabSpeedTest(callbacks: SpeedTestCallbacks = {}): Promise<SpeedTestResult> {
  let phase: SpeedTestPhase = 'discovering';
  let downloadMbps: number | null = null;
  let uploadMbps: number | null = null;
  let serverLabel: string | null = null;
  let serverLocation: string | null = null;
  let caughtError: Error | null = null;

  const emit = () => {
    callbacks.onMeasurement?.({
      phase,
      downloadMbps,
      uploadMbps,
      serverLabel,
      serverLocation,
    });
  };

  const setPhase = (nextPhase: SpeedTestPhase) => {
    phase = nextPhase;
    callbacks.onPhaseChange?.(nextPhase);
    emit();
  };

  setPhase('discovering');

  const returnCode = await ndt7.test(
    {
      userAcceptedDataPolicy: true,
      downloadworkerfile: downloadWorkerUrl,
      uploadworkerfile: uploadWorkerUrl,
      metadata: {
        client_name: 'ctxrun-network-monitor',
      },
    },
    {
      error: (message: unknown) => {
        const detail = typeof message === 'string' ? message : 'Unknown speed test error';
        caughtError = new Error(detail);
      },
      serverChosen: (server: unknown) => {
        const details = getServerDetails(server);
        serverLabel = details.label;
        serverLocation = details.location;
        emit();
      },
      downloadStart: () => {
        setPhase('download');
      },
      downloadMeasurement: ({ Data }: { Data: unknown }) => {
        downloadMbps = readMbps(Data) ?? downloadMbps;
        emit();
      },
      downloadComplete: ({ LastClientMeasurement }: { LastClientMeasurement?: unknown }) => {
        downloadMbps = readMbps(LastClientMeasurement) ?? downloadMbps;
        emit();
      },
      uploadStart: () => {
        setPhase('upload');
      },
      uploadMeasurement: ({ Data }: { Data: unknown }) => {
        uploadMbps = readMbps(Data) ?? uploadMbps;
        emit();
      },
      uploadComplete: ({ LastClientMeasurement }: { LastClientMeasurement?: unknown }) => {
        uploadMbps = readMbps(LastClientMeasurement) ?? uploadMbps;
        emit();
      },
    },
  );

  if (caughtError) {
    throw caughtError;
  }
  if (returnCode !== 0) {
    throw new Error(`Speed test failed with code ${returnCode}`);
  }

  phase = 'complete';
  emit();

  return {
    phase,
    returnCode,
    downloadMbps,
    uploadMbps,
    serverLabel,
    serverLocation,
  };
}

function readMbps(measurement: unknown): number | null {
  if (!measurement || typeof measurement !== 'object') {
    return null;
  }

  const record = measurement as Record<string, unknown>;
  const direct = record.MeanClientMbps;
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return Number(direct.toFixed(2));
  }

  return null;
}

function getServerDetails(server: unknown): { label: string | null; location: string | null } {
  if (!server || typeof server !== 'object') {
    return { label: null, location: null };
  }

  const value = server as Record<string, unknown>;
  const locationObject =
    value.location && typeof value.location === 'object'
      ? (value.location as Record<string, unknown>)
      : null;

  const label =
    readString(value.machine) ??
    readString(value.hostname) ??
    readString(value.fqdn) ??
    readString(value.site) ??
    null;

  const location = [
    readString(locationObject?.city) ?? readString(value.city),
    readString(locationObject?.country) ?? readString(value.country),
  ]
    .filter(Boolean)
    .join(', ');

  return {
    label,
    location: location || null,
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
