import * as discord from 'discord.js';
import {Script} from '../types';
import {NodeVM, VMScript} from 'vm2';
import Bot from './index';
import {ArgedMessage} from './arguments';

type Listener = (...args: any[]) => void;
interface RegisteredListener {
  name: string;
  listener: Listener;
}
type CommandHandler = (message: ArgedMessage) => void;
interface RegisteredCommand {
  name: string;
  handler: CommandHandler;
}

export default class BotScript {
  public id: string;
  public name: string;
  public body: string;
  public platform: string;

  public commands: RegisteredCommand[] = [];
  public listeners: RegisteredListener[] = [];

  public exports: any = {};

  private readonly client: discord.Client;

  constructor(private bot: Bot, data: Script) {
    this.client = bot.client;
    this.id = data.id;
    this.name = data.name;
    this.body = data.body;
    this.platform = data.platform;
  }

  public executeScript(): any {
    const vm = new NodeVM({
      sandbox: this.makeSandbox()
    });
    const ret = vm.run(new VMScript(this.body)); // VMScript constructor isn't necessary, but Typescript disagrees
    return this.exports;
  }
  public async shutdown() {
    this.listeners.forEach(({name, listener}) => this.client.removeListener(name, listener));
    this.commands = [];
  }
  private makeSandbox() {
    const clientTraps = {
      get: (obj: discord.Client, prop: string): any => {
        console.log(prop);
        if (prop === 'on') return this.clientOn;
        if (prop === 'token') return '[ SECURE ]';
        else return obj[prop];
      }
    };
    return {
      client: new Proxy(this.client, clientTraps),
      command: (n: string, h: CommandHandler) => this.addCommand(n, h),
      exports: this.exports,
      // I've set it so you can't import from an importable script to prevent circular deps. Fix later?
      // importScript: this.importable ? null : (name: string) => this.importScript(name) // TODO fix this ugly hack
    };
  }
  private importScript(name: string) {
    return this.bot.importScript(name);
  }
  private clientOn(name: string, listener: Listener): discord.Client {
    // Hello, we are now inside the sandbox
    this.listeners.push({name, listener});
    this.client.on(name, listener);
    return this.client;
  }
  private addCommand(name: string, handler: CommandHandler) {
    this.commands.push({name, handler});
  }
}