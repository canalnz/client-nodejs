import {EventEmitter} from 'events';
import * as discord from 'discord.js';
import {Script} from '../types';
import Canal from '../canal';
import BotScript from './botScript';
import Arguments, {ArgedMessage} from './arguments';

export default class Bot extends EventEmitter {
  public activeScripts: BotScript[] = [];
  public client: discord.Client;
  private importerCache: Map<string, any> = new Map();

  constructor(private canal: Canal) {
    super();
    this.client = new discord.Client();
    this.client.on('message', (m) => this.onMessage(m));
    this.client.on('ready', () => this.initClient());
    this.canal.on('ready', () => this.setup());
  }
  public close() {
    this.client.destroy();
  }
  public importScript(name: string) {
    if (this.importerCache.has(name)) {
      return this.importerCache.get(name);
    } else {
      throw new Error(`Script ${name} can't be required: not loaded yet`);
    }
  }
  private async setup() {
    await this.client.login(this.canal.token as string);
  }
  private execScript(scriptData: Script): Script {
    const script = new BotScript(this, scriptData);
    this.activeScripts.push(script);
    const scriptExports = script.executeScript();
    this.importerCache.set(script.name, scriptExports);
    return script;
  }
  private async stopScript(id: string): Promise<void> {
    const script = this.activeScripts.find((s) => s.id === id);
    if (!script) throw new ReferenceError(`Can't shutdown script ${id}: it isn't running`);
    await script.shutdown();
  }
  private initClient() {
    console.log(`🤞 Initializing with ${this.canal.autostartScripts.length} scripts`);
    this.canal.autostartScripts.forEach((s) => this.execScript(s));
  }
  private onMessage(message: discord.Message): void {
    if (message.author.bot) return;
    if (message.mentions.users.has(this.client.user.id)) { // If the bot is mentioned?
      this.dispatchCommand(message);
    }
  }
  private async dispatchCommand(rawMessage: discord.Message): Promise<void> {
    (rawMessage as ArgedMessage).args = Arguments.parse(rawMessage);
    const message: ArgedMessage = rawMessage as ArgedMessage;
    console.log(`Aaaand the command today is: ${message.args.command}`);
    console.log(this.activeScripts);
    this.activeScripts.forEach((script) => {
      script.commands.filter((c) => c.name === message.args.command).forEach((c) => c.handler(message));
    });
  }
}
