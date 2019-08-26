import Canal from './canal';
import Bot from './bot';
import {EventEmitter} from 'events';

function ready(emitter: EventEmitter) {
  return new Promise((resolve) => emitter.once('ready', () => resolve()));
}

async function main() {
  const canal = await Canal.connect();
  const bot = new Bot(canal);

  const cleanup = () => {
    canal.close();
    bot.close();
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
}

main();
