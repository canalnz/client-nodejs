import * as EventEmitter from 'events';
import * as WebSocket from 'ws';
import Canal from './index';
import {Script} from '../types';
import ReconnectingSocket from './reconnectingsocket';

type Message = [string, any] | [string];
interface HelloPayload {
  heartbeat: number;
}
interface ReadyPayload {
  token: string;
  scripts: Script[];
}

export class ConnectionManager extends EventEmitter {
  private readonly ws: ReconnectingSocket;
  private debugMode: boolean = true;
  // Heartbeat
  private heartbeatTimer: NodeJS.Timer | null = null;
  private heartbeatInterval: number | null = null;
  // Higher level frame queue
  private connected: boolean = false;
  private ready: boolean = false;
  private messageQueue: Message[] = [];

  constructor(private canal: Canal) {
    super();
    this.ws = new ReconnectingSocket(this.canal.gatewayUrl);
    this.ws.on('open', () => this.onOpen());
    this.ws.on('reconnecting', () => this.onReconnecting());
    this.ws.on('message', (m) => this.onMessage(m));
  }

  public send(message?: Message) {
    if (!this.ready && message) return this.messageQueue.push(message);
    if (message) this._send(message);
    if (this.messageQueue.length) {
      this.send(this.messageQueue.shift());
    }
  }
  public destroy() {
    if (this.ws) this.ws.close(1000, 'Goodbye'); // TODO
    if (this.messageQueue) this.messageQueue = [];
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  private onOpen() {
    this.connected = true;
  }
  private onReconnecting() {
    this.connected = false;
    this.ready = false;
  }
  private onHello({heartbeat}: HelloPayload) {
    this.setupHeartbeat(heartbeat);
    this.identify();
  }
  private onReady(payload: ReadyPayload) {
    this.ready = true;
    this.send();
    this.emit('ready', payload);
  }
  private onMessage(raw: WebSocket.Data) {
    const [eventName, payload] = this.deserialize(raw);
    this.debug('< ' + eventName);
    if (eventName === 'HELLO') this.onHello(payload);
    else {
      if (eventName === 'READY') this.onReady(payload);
      this.emit('message', eventName, payload);
    }
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
  private debug(m: string) {
    if (this.debugMode) console.debug(m);
  }
  private _send(message: Message) {
    if (!this.ws) throw new Error('This shouldn\'t happen!');
    if (message[0] !== 'HEARTBEAT') this.debug('> ' + message[0]);
    this.ws.send(this.serialize(message));
  }
  private serialize(d: Message): string {
    return JSON.stringify(d);
  }
  private deserialize(data: WebSocket.Data): Message {
    return JSON.parse(data.toString('utf8'));
  }
}
