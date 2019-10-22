import {EventEmitter} from 'events';
import * as discord from 'discord.js';
import {Script} from '../types';
import Canal from '../canal';
import {clientStates} from '../canal/constants';
import Storage from './storage';
import BotScript from './bot-script';
import Arguments, {ArgedMessage} from './arguments';
import Internals from './internals';

export default class Bot extends EventEmitter {
  public activeScripts: BotScript[] = [];
  public client: discord.Client;
  public storage: Storage | null = null;
  private importerCache: Map<string, any> = new Map();
  private internals: Internals;
  private hasInitialised: boolean = false;

  constructor(public canal: Canal) {
    super();
    this.internals = new Internals(this);
    this.client = new discord.Client();
    this.client.on('message', (m) => this.onMessage(m));
    this.client.on('ready', () => this.initialiseScripts());
    this.canal.on('ready', () => this.setup());
    this.canal.on('scriptCreate', (s) => this.runScript(s));
    this.canal.on('scriptUpdate', (s) => this.updateScript(s));
    this.canal.on('scriptRemove', (s) => this.removeScript(s));
  }
  public close() {
    this.activeScripts.forEach((s) => s.shutdown());
    this.client.destroy();
    this.hasInitialised = false;
  }
  public importScript(name: string) {
    if (this.importerCache.has(name)) {
      return this.importerCache.get(name);
    } else {
      throw new Error(`Script ${name} can't be required: not loaded yet`);
    }
  }
  private async setup() {
    if (this.hasInitialised) this.close(); // If we are currently connected, recycle and connect again
    this.hasInitialised = true; // Leave this at the top to avoid race conditions
    this.storage = await Storage.connect(this.canal.opts.dbPath);
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
    this.canal.debug('Bot', `🤞 Initializing with ${this.canal.scripts.length} scripts`);
    this.canal.scripts.forEach((s) => this.runScript(s));
    this.canal.setState(clientStates.ONLINE);
  }
  private onMessage(message: discord.Message): void {
    if (message.author.bot) return; // Bots can't issue commands.
    if (message.mentions.users.has(this.client.user.id)) { // If the bot is mentioned
      this.dispatchCommand(message);
    }
  }
  private dispatchCommand(rawMessage: discord.Message): void {
    (rawMessage as ArgedMessage).args = Arguments.parse(rawMessage);
    const message: ArgedMessage = rawMessage as ArgedMessage;
    this.canal.debug('Bot', `Received command: ${message.args.command}`);
    this.internals.dispatch(message);
    this.activeScripts.forEach((script) => {
      script.commands.filter((c) => c.name === message.args.command).forEach((c) => c.handler(message));
    });
  }
}
