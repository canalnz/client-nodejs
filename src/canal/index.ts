import {EventEmitter} from 'events';
import {Script} from '../types';
import {ConnectionManager} from './connection-manager';
import {
  ClientState, clientStates,
  ConnectionState, connectionStates,
  EventName, messages, ScriptState
} from './constants';
import { Config } from '../config';

interface ReadyPayload {
  token: string;
  scripts: Script[];
}

function EventHandler(event: EventName) {
  return (target: Canal, propertyKey: keyof Canal) => {
    target.socketEventHandlers = target.socketEventHandlers || {};
    target.socketEventHandlers[event] = propertyKey;
  };
}

interface HasId {
  id: string;
}
function matches(a: HasId[], b: HasId[]) {
  // Checks every a is in b, and every b is in a
  if (a.length !== b.length) return false;
  // They're the same length, so we can just do a one way check.
  return a.every((ai) => !!b.find((bi) => ai.id === bi.id));
}

export class Canal extends EventEmitter {
  public state: ConnectionState;
  public debugMode: boolean;
  public socketEventHandlers: {[propName: string]: keyof Canal} | undefined;
  public apiKey: string | null = null;
  public gatewayUrl: string;
  public token: string | null = null;
  public scripts: Map<string, Script> = new Map();
  protected connection: ConnectionManager;

  constructor(public opts: Config) {
    super();
    this.apiKey = opts.apiKey;
    this.gatewayUrl = opts.gatewayUrl;
    this.debugMode = opts.debug;

    this.state = connectionStates.CONNECTING;
    this.connection = new ConnectionManager(this);
    // CanalConnection deals with heartbeat
    this.connection.on('ready', () => this.debug('Canal', '👋 Connected to ' + this.gatewayUrl));
    this.connection.on('end', (e) => {
      this.debug('Canal', 'ConnMan has ended, Canal is currently', this.state);
      // If this wasn't a clean shutdown, throw an error
      if (this.state !== connectionStates.DEAD) {
        this.state = connectionStates.DEAD;
        throw new Error('🔥 Something went wrong with the connection :(\n' + e);
      }
      this.state = connectionStates.DEAD;
      this.emit('end', e);
    });
    this.connection.on('message', (e, p) => this.onEvent(e, p));
  }

  public setState(state: ClientState, error?: Error) {
    this.connection.send([messages.CLIENT_STATUS_UPDATE, { state, error }]);
  }
  public setScriptState(scriptId: string, state: ScriptState) {
    this.connection.send([messages.SCRIPT_STATUS_UPDATE, {state, id: scriptId}]);
  }

  public destroy() {
    if (this.state === connectionStates.DEAD) return this.debug('Canal', 'Not cleaning up, already dead');
    this.state = connectionStates.DEAD;
    this.debug('Canal', 'Destroying...');
    this.connection.close(1000, 'Shutting down');
  }

  @EventHandler('READY')
  public onReady(payload: ReadyPayload) {
    if (
      this.state !== connectionStates.READY || // If this is the initial connection
      this.token !== payload.token ||
      !matches(Array.from(this.scripts.values()), payload.scripts) // Or something changed
    ) {
      this.state = connectionStates.READY;
      this.token = payload.token;
      payload.scripts.forEach((s) => this.scripts.set(s.id, s));
      this.emit('ready');
    } else {
      // We reconnected, and nothing changed. For now, let's just pretend no interruption happened
      // We still need to set the state as online, because it resets to STARTUP every connection
      this.setState(clientStates.ONLINE);
    }
  }

  @EventHandler('SCRIPT_CREATE')
  public async scriptCreate(script: Script) {
    this.debug('Canal', `⚙️ [+ ${script.id}] ${script.name} has been created`);
    this.scripts.set(script.id, script);
    this.emit('scriptCreate', script);
  }

  @EventHandler('SCRIPT_UPDATE')
  public async scriptUpdate(script: Partial<Script> & {id: string}) {
    const updatedScript = { // Overwrite changed fields in the old script
      ...this.scripts.get(script.id),
      ...filter(script) as Script // Cast is not safe, but this is the easiest way to type it, and works out ok
    };
    this.debug('Canal', `⚙️ [* ${script.id}] ${updatedScript.name} has been updated`);
    this.scripts.set(script.id, updatedScript);
    this.emit('scriptUpdate', updatedScript);
  }

  @EventHandler('SCRIPT_REMOVE')
  public async scriptRemove(script: Pick<Script, 'id'>) {
    this.debug('Canal', `⚙️ [- ${script.id}] Script has been removed`);
    this.scripts.delete(script.id);
    this.emit('scriptRemove', script);
  }

  public debug(module: string, ...args: any[]) {
    if (this.debugMode) {
      console.debug(`[${new Date().toISOString()} - ${module.substr(0, 10).padEnd(10)}]`, ...args);
    }
  }
  private onEvent(eventName: EventName, payload: any) {
    const handlerName = this.socketEventHandlers && this.socketEventHandlers[eventName];
    if (handlerName) {
      (this[handlerName] as any)(payload);
    } else throw new TypeError(`🔥 Got event ${eventName} from gateway, but don't have a handler for it!`);
  }
}

export default Canal;

// Removes undefined properties, meaning they won't override in a ...spread
function filter(obj: {[prop: string]: any}) {
  Object.keys(obj).forEach((k) => obj[k] === undefined && delete obj[k]);
  return obj;
}
