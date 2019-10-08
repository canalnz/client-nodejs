import Canal from './canal';
import Bot from './bot';
import {EventEmitter} from 'events';

const CANAL_API_KEY = process.env.CANAL_API_KEY as string;

if (!CANAL_API_KEY) throw new Error('An API key is required! Please set CANAL_API_KEY');

function ready(emitter: EventEmitter) {
  return new Promise((resolve) => emitter.once('ready', () => resolve()));
}

async function main() {
  const canal = new Canal({
    apiKey: CANAL_API_KEY,
    gatewayUrl: process.env.GATEWAY_HOST
  });

  const bot = new Bot(canal);

  const cleanup = () => {
    canal.destroy();
    bot.close();
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
}

main();
