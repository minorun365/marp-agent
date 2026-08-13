export interface RuntimeConfig {
  auth: {
    region: string;
    userPoolId: string;
    userPoolClientId: string;
    cognitoDomain?: string;
  };
  agent: {
    runtimeArn: string;
    protocol: 'HTTP' | 'AGUI';
    endpoint?: string;
  };
  sharing?: {
    baseUrl: string;
  };
  environment: string;
}

let currentRuntimeConfig: RuntimeConfig | undefined;

export function setRuntimeConfig(config: RuntimeConfig) {
  currentRuntimeConfig = config;
}

export function getRuntimeConfig(): RuntimeConfig {
  if (!currentRuntimeConfig) {
    throw new Error('Runtime configuration is not initialized');
  }
  return currentRuntimeConfig;
}
