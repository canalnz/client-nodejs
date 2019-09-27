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
    this.client.on('ready', () => this.initialiseScripts());
    this.canal.on('ready', () => this.setup());
    this.canal.on('scriptCreate', (s) => this.runScript(s));
    this.canal.on('scriptUpdate', (s) => this.updateScript(s));
    this.canal.on('scriptRemove', (s) => this.removeScript(s));
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
  private runScript(scriptData: BotScript | Script): BotScript {
    const script = scriptData instanceof BotScript ? scriptData : new BotScript(this, scriptData);
    this.activeScripts.push(script);
    script.executeScript();
    return script;
  }
  private async updateScript(scriptData: Script): Promise<BotScript> {
    const script = this.activeScripts.find((s) => s.id === scriptData.id);
    if (!script) throw new Error(`Failed to update script ${scriptData.id}: Not running`);
    await this.stopScript(script.id);
    script.patch(scriptData);
    return this.runScript(script);
  }
  private async stopScript(id: string): Promise<void> {
    const scriptIndex = this.activeScripts.findIndex((s) => s.id === id);
    const script = this.activeScripts[scriptIndex];
    if (!script) throw new ReferenceError(`Can't shutdown script ${id}: it isn't running`);
    await script.shutdown();
    this.activeScripts.splice(scriptIndex, 1);
  }
  private async removeScript(script: Partial<Script>): Promise<void> {
    this.stopScript(script.id as string);
  }
  private initialiseScripts() {
    console.log(`🤞 Initializing with ${this.canal.autostartScripts.length} scripts`);
    this.canal.autostartScripts.forEach((s) => this.runScript(s));
  }
  private onMessage(message: discord.Message): void {
    if (message.author.bot) return;
    if (message.mentions.users.has(this.client.user.id)) { // If the bot is mentioned?
      this.dispatchCommand(message);
    }
  }
  private dispatchCommand(rawMessage: discord.Message): void {
    (rawMessage as ArgedMessage).args = Arguments.parse(rawMessage);
    const message: ArgedMessage = rawMessage as ArgedMessage;
    console.log(`Aaaand the command today is: ${message.args.command}`);
    console.log(this.activeScripts);
    this.activeScripts.forEach((script) => {
      script.commands.filter((c) => c.name === message.args.command).forEach((c) => c.handler(message));
    });
  }
}
