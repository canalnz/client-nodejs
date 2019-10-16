import Canal from './canal';
import Bot from './bot';
import {loadConfig} from './config';

async function main() {
  const config = await loadConfig();

  const canal = new Canal({
    apiKey: config.apiKey,
    gatewayUrl: config.gatewayUrl,
    debug: config.debug
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
