import {EventEmitter} from 'events';
import {Script} from '../types';
import {ConnectionManager} from './connectionManager';
import {ClientState, endpoints, EventName, messages, ScriptState} from './constants';

interface CanalClientOpts {
  apiKey: string;
  gatewayUrl?: string;
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
  public socketEventHandlers: {[propName: string]: keyof Canal} | undefined;
  public apiKey: string | null = null;
  public gatewayUrl: string = endpoints.GATEWAY;
  public token: string | null = null;
  public autostartScripts: Script[] = [];
  protected connection: ConnectionManager;

  constructor(opts: CanalClientOpts) {
    super();
    this.apiKey = opts.apiKey;
    if (opts && opts.gatewayUrl) this.gatewayUrl = opts.gatewayUrl;

    this.connection = new ConnectionManager(this);
    // CanalConnection deals with heartbeat
    this.connection.on('connected', () => console.log('👋 Connected to ' + this.gatewayUrl));
    this.connection.on('close', (code, message) => {
      throw new Error(`🔥 Connection closed: ${code} -- ${message}`);
    });
    this.connection.on('error', (e) => {
      throw new Error('🔥 Something went wrong with the connection :(\n' + e);
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
    this.connection.destroy();
  }

  @EventHandler('READY')
  public onReady(payload: ReadyPayload) {
    this.token = payload.token;
    this.autostartScripts = payload.scripts;
    this.emit('ready');
  }

  @EventHandler('SCRIPT_CREATE')
  public async scriptCreate(script: Script) {
    console.log(`⚙️ Beep boop, it's time to run the script ${script.name}`);
    this.emit('scriptCreate', script);
  }

  @EventHandler('SCRIPT_UPDATE')
  public async scriptUpdate(script: Partial<Script> & {id: string}) {
    console.log(`- [Script ${script.id}]: Script updated!`);
    this.emit('scriptUpdate', script);
  }

  @EventHandler('SCRIPT_REMOVE')
  public async scriptRemove(script: Pick<Script, 'id'>) {
    console.log(`- [Script ${script.id}]: Script removed!`);
    this.emit('scriptRemove', script);
  }

  private onEvent(eventName: EventName, payload: any) {
    const handlerName = this.socketEventHandlers && this.socketEventHandlers[eventName];
    if (handlerName) {
      (this[handlerName] as any)(payload);
    } else throw new TypeError(`🔥 Got event ${eventName} from gateway, but don't have a handler for it!`);
  }
}

export default Canal;
