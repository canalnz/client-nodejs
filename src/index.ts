import Canal from './canal';
import Bot from './bot';
import {loadConfig} from './config';

async function main() {
  const config = await loadConfig();

  const canal = new Canal(config);

  const bot = new Bot(canal);

  const cleanup = () => {
    bot.close();
    canal.destroy();
  };
  process.on('exit', () => {
    canal.debug('Core', 'Process exiting!');
    cleanup();
  });
  process.on('SIGINT', () => {
    canal.debug('Core', 'SIGINT');
    cleanup();
  });
}

main();
