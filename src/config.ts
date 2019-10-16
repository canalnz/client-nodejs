import * as fs from 'fs';
import * as path from 'path';

interface Config {
  apiKey: string;
  gatewayUrl?: string;
}

export async function loadConfig(): Promise<Config> {
  const configPath = path.resolve(process.env.CANAL_CONFIG || 'config.json');
  let config;
  let rawConfig;
  try {
    rawConfig = fs.readFileSync(configPath, 'utf8');
  } catch (e) {
    // If it's explicitly provided, it must exist
    if (process.env.CANAL_CONFIG) throw new Error('Couldn\'t read config file: ' + configPath);
  }

  if (rawConfig) {
    try {
      config = JSON.parse(rawConfig);
    } catch (e) {
      throw new Error('Failed to parse configuration file: ' + configPath);
    }
  }

  config = {
    gatewayUrl: process.env.CANAL_GATEWAY,
    apiKey: process.env.CANAL_API_KEY,
    ...config // Config file takes precedence
  };

  if (!config.apiKey) throw new Error('An API key is required! Please set CANAL_API_KEY');

  return config;
}
