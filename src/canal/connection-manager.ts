import * as EventEmitter from 'events';
import * as WebSocket from 'ws';
import Canal from './index';
import {Script} from '../types';
import ReconnectingSocket from './reconnecting-socket';
import {ConnectionState, connectionStates} from './constants';

type Message = [string, any] | [string];
interface HelloPayload {
  heartbeat: number;
}
interface ReadyPayload {
  token: string;
  scripts: Script[];
}

export class ConnectionManager extends EventEmitter {
  public state: ConnectionState;
  private readonly ws: ReconnectingSocket;
  // Heartbeat
  private heartbeatTimer: NodeJS.Timer | null = null;
  private heartbeatInterval: number | null = null;
  private messageQueue: Message[] = [];

  constructor(private canal: Canal) {
    super();
    this.state = connectionStates.CONNECTING;
    this.ws = new ReconnectingSocket(this.canal.gatewayUrl, this.canal);
    this.ws.on('open', () => this.onOpen());
    this.ws.on('reconnecting', () => this.onReconnecting());
    this.ws.on('end', (r) => this.onEnd(r));
    this.ws.on('message', (m) => this.onMessage(m));
  }

  public send(message?: Message) {
    if (this.state !== connectionStates.READY && message) return this.messageQueue.push(message);
    if (message) this._send(message);
    if (this.messageQueue.length) {
      this.send(this.messageQueue.shift());
    }
  }
  public close(code?: number, message?: string) {
    this.canal.debug('ConnMan', 'Forcing client closed!', code, message);
    this.ws.close(code || 1000, message || 'Goodbye');
    // this.state = connectionStates.DEAD;
    // this.cleanup(code);
  }

  private onOpen() {
    // Stub
  }
  private onReconnecting() {
    this.state = connectionStates.RECONNECTING;
  }
  private onHello({heartbeat}: HelloPayload) {
    this.setupHeartbeat(heartbeat);
    this.identify();
  }
  private onReady(payload: ReadyPayload) {
    this.state = connectionStates.READY;
    this.ws.didReady();
    this.send();
    this.emit('ready', payload);
  }
  private onMessage(raw: WebSocket.Data) {
    const [eventName, payload] = this.deserialize(raw);
    this.canal.debug('ConnMan', '< ' + eventName);
    if (eventName === 'HELLO') this.onHello(payload);
    else {
      if (eventName === 'READY') this.onReady(payload);
      this.emit('message', eventName, payload);
    }
  }
  private onEnd(reason?: Error | number) {
    this.canal.debug('ConnMan', 'RecSock has ended! ConnMan is currently', this.state);
    if (this.state === connectionStates.DEAD) this.canal.debug('ConnMan', 'RecSock ended, but we\'re cleaning up elsewhere');
    else this.cleanup(reason);
  }

  // Heartbeating
  private setupHeartbeat(interval: number) {
    this.heartbeatInterval = interval;
    this.heartbeatTimer = setInterval(() => this.doHeartbeat(), interval);
  }
  private doHeartbeat() {
    this._send(['HEARTBEAT']);
  }

  // Utils
  private identify() {
    this._send(['IDENTIFY', {
      token: this.canal.apiKey,
      client_info: {
        name: 'Canal-Bot-Nodejs'
      }
    }]);
  }
  private cleanup(reason?: Error | number) {
    this.canal.debug('ConnMan', 'Cleaning up...', reason);
    if (this.state === connectionStates.DEAD) return this.canal.debug('ConnMan', 'Cleanup called too many times!');
    this.state = connectionStates.DEAD;
    if (this.messageQueue.length) this.messageQueue = [];
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.canal.debug('ConnMan', 'ConnMan has cleaned up, emitting end');
    this.emit('end', reason);
  }
  private _send(message: Message) {
    if (!this.ws) throw new Error('This shouldn\'t happen!');
    if (message[0] !== 'HEARTBEAT') this.canal.debug('ConnMan', '> ' + message[0]);
    this.ws.send(this.serialize(message));
  }
  private serialize(d: Message): string {
    return JSON.stringify(d);
  }
  private deserialize(data: WebSocket.Data): Message {
    return JSON.parse(data.toString('utf8'));
  }
}
