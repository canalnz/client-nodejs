import * as fs from 'fs';
import * as path from 'path';
import {endpoints} from './canal/constants';

export interface Config {
  apiKey: string;
  gatewayUrl: string;
  debug: boolean;
  dbPath: string;
}
const DEFAULTS: Partial<Config> = {
  gatewayUrl: endpoints.GATEWAY,
  debug: false,
  dbPath: 'data/db.sqlite'
};

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
  const env = filter({
    gatewayUrl: process.env.CANAL_GATEWAY,
    apiKey: process.env.CANAL_API_KEY,
    debug: process.env.DEBUG || process.env.CANAL_DEBUG,
    dbPath: process.env.CANAL_DB_PATH
  });

  config = {
    ...DEFAULTS,
    ...env,
    ...config // Config file takes precedence
  };

  if (!config.apiKey) throw new Error('An API key is required! Please set CANAL_API_KEY');
  config.dbPath = path.resolve(config.dbPath);

  return config;
}

// Removes undefined properties, meaning they won't override in a ...spread
function filter(obj: {[propName: string]: any}) {
  Object.keys(obj).forEach((k) => obj[k] === undefined && delete obj[k]);
  return obj;
}
