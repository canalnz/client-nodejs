import * as discord from 'discord.js';
import fetch from 'node-fetch';
import {Script} from '../types';
import {NodeVM, VMScript} from 'vm2';
import Bot from './index';
import {ArgedMessage} from './arguments';
import {scriptStates} from '../canal/constants';

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
  public get isPassive() {
    return this.commands.length || this.listeners.length;
  }

  private readonly client: discord.Client;

  constructor(private bot: Bot, data: Script) {
    this.client = bot.client;
    this.id = data.id;
    this.name = data.name;
    this.body = data.body;
    this.platform = data.platform;
  }

  public executeScript(): any {
    this.bot.canal.setScriptState(this.id, scriptStates.RUNNING);
    const vm = new NodeVM({
      sandbox: this.makeSandbox()
    });
    let ret;
    try {
      ret = vm.run(new VMScript(this.body)); // VMScript constructor isn't necessary, but Typescript disagrees
      this.bot.canal.setScriptState(this.id, this.isPassive ? scriptStates.PASSIVE : scriptStates.STOPPED);
    } catch (e) {
      this.bot.canal.setScriptState(this.id, scriptStates.ERROR);
    }
    return this.exports;
  }
  public async shutdown() {
    this.listeners.forEach(({name, listener}) => this.client.removeListener(name, listener));
    this.commands = [];
  }
  public patch(update: Script) {
    if (update.name) this.name = update.name;
    if (update.body) this.body = update.body;
    if (update.platform) this.platform = update.platform;
  }
  private makeSandbox() {
    const clientTraps = {
      get: (obj: discord.Client, prop: keyof discord.Client): any => {
        if (prop === 'on') return this.clientOn;
        if (prop === 'token') return '[ SECURE ]';
        else return obj[prop];
      }
    };
    return {
      client: new Proxy(this.client, clientTraps),
      command: (n: string, h: CommandHandler) => this.addCommand(n, h),
      exports: this.exports,
      fetch,
      storage: this.bot.storage && this.bot.storage.api
      // TODO perms
      // I've set it so you can't import from an importable script to prevent circular deps. Fix later?
      // importScript: this.importable ? null : (name: string) => this.importScript(name) // TODO fix this ugly hack
    };
  }
  private importScript(name: string) {
    return this.bot.importScript(name);
  }
  private clientOn = (name: string, listener: Listener): discord.Client => {
    // Hello, we are now inside the sandbox
    this.listeners.push({name, listener});
    this.client.on(name, listener);
    return this.client;
  }
  private addCommand(name: string, handler: CommandHandler) {
    this.commands.push({name, handler});
  }
}
