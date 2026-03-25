declare module '@m-lab/ndt7' {
  interface Ndt7Config {
    userAcceptedDataPolicy?: boolean;
    mlabDataPolicyInapplicable?: boolean;
    downloadworkerfile?: string;
    uploadworkerfile?: string;
    metadata?: Record<string, string>;
    server?: string;
    protocol?: 'ws' | 'wss';
    loadbalancer?: string;
    clientRegistrationToken?: string;
  }

  interface Ndt7Callbacks {
    error?: (message: unknown) => void;
    serverDiscovery?: (payload: unknown) => void;
    serverChosen?: (server: unknown) => void;
    downloadStart?: (payload: unknown) => void;
    downloadMeasurement?: (payload: { Source: string; Data: unknown }) => void;
    downloadComplete?: (payload: {
      LastClientMeasurement?: unknown;
      LastServerMeasurement?: unknown;
    }) => void;
    uploadStart?: (payload: unknown) => void;
    uploadMeasurement?: (payload: { Source: string; Data: unknown }) => void;
    uploadComplete?: (payload: {
      LastClientMeasurement?: unknown;
      LastServerMeasurement?: unknown;
    }) => void;
  }

  interface Ndt7Api {
    test(config: Ndt7Config, callbacks?: Ndt7Callbacks): Promise<number>;
  }

  const ndt7: Ndt7Api;
  export default ndt7;
}
