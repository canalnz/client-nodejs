import CanalConnection from './connection';
import {EventEmitter} from 'events';
import {Script} from '../types';

const CANAL_API_KEY = process.env.CANAL_API_KEY;
const GATEWAY_URL = 'ws://localhost:4040/';

type OutgoingEventName = 'HEARTBEAT' | 'IDENTIFY' | 'CLIENT_STATUS_UPDATE' | 'SCRIPT_STATUS_UPDATE';
type IncomingEventName = 'HELLO' | 'READY' | 'SCRIPT_CREATE' | 'SCRIPT_UPDATE' | 'SCRIPT_REMOVE';
interface ReadyPayload {
  token: string;
  scripts: Script[];
}

function EventHandler(event: IncomingEventName) {
  return (target: Canal, propertyKey: keyof Canal) => {
    target.socketEventHandlers = target.socketEventHandlers || {};
    target.socketEventHandlers[event] = propertyKey;
  };
}

export class Canal extends EventEmitter {
  public static async connect() {
    return new Canal(GATEWAY_URL);
  }

  public socketEventHandlers: {[propName: string]: keyof Canal} | undefined;
  public token: string | null = null;
  public autostartScripts: Script[] = [];
  protected connection: CanalConnection;

  constructor(url: string) {
    super();
    this.connection = new CanalConnection(url);
    // CanalConnection deals with heartbeat
    this.connection.on('connected', () => console.log('👋 Connected to ' + url));
    this.connection.on('closed', ([code, message]) => {
      throw new Error(`🔥 Connection closed: ${code} -- ${message}`);
    });
    this.connection.on('error', (e) => {
      throw new Error('🔥 Something went wrong with the connection :(\n' + e);
    });
    this.connection.on('message', (eventName: string, payload: any) => {
      const handlerName = this.socketEventHandlers && this.socketEventHandlers[eventName];
      if (handlerName) {
        (this[handlerName] as any)(payload);
      } else throw new TypeError(`🔥 Got event ${eventName} from client, but don't have a handler for it!`);
    });
  }

  public close() {
    this.connection.close();
  }

  @EventHandler('HELLO')
  public sendIdentify() {
    this.connection.send('IDENTIFY', {
      token: CANAL_API_KEY,
      client_info: {
        name: 'Canal-Bot-Nodejs'
      }
    });
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
}

export default Canal;
