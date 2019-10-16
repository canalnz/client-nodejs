import {EventEmitter} from 'events';
import {Script} from '../types';
import {ConnectionManager} from './connection-manager';
import {ClientState, ConnectionState, connectionStates, endpoints, EventName, messages, ScriptState} from './constants';

interface CanalClientOpts {
  apiKey: string;
  gatewayUrl: string;
  debug: boolean;
}

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

export class Canal extends EventEmitter {
  public state: ConnectionState;
  public debugMode: boolean;
  public socketEventHandlers: {[propName: string]: keyof Canal} | undefined;
  public apiKey: string | null = null;
  public gatewayUrl: string;
  public token: string | null = null;
  public autostartScripts: Script[] = [];
  protected connection: ConnectionManager;

  constructor(opts: CanalClientOpts) {
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
    this.connection.send([messages.SCRIPT_STATUS_UPDATE, {state, script: scriptId}]);
  }

  public destroy() {
    if (this.state === connectionStates.DEAD) return this.debug('Canal', 'Not cleaning up, already dead');
    this.state = connectionStates.DEAD;
    this.debug('Canal', 'Destroying...');
    this.connection.close(1000, 'Shutting down');
  }

  @EventHandler('READY')
  public onReady(payload: ReadyPayload) {
    this.state = connectionStates.READY;
    this.token = payload.token;
    this.autostartScripts = payload.scripts;
    this.emit('ready');
  }

  @EventHandler('SCRIPT_CREATE')
  public async scriptCreate(script: Script) {
    this.debug('Canal', `⚙️ Beep boop, it's time to run the script ${script.name}`);
    this.emit('scriptCreate', script);
  }

  @EventHandler('SCRIPT_UPDATE')
  public async scriptUpdate(script: Partial<Script> & {id: string}) {
    this.debug('Canal', `- [Script ${script.id}]: Script updated!`);
    this.emit('scriptUpdate', script);
  }

  @EventHandler('SCRIPT_REMOVE')
  public async scriptRemove(script: Pick<Script, 'id'>) {
    this.debug('Canal', `- [Script ${script.id}]: Script removed!`);
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
