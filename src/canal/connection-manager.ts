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
  private heartbeatRate: number | null = null;
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
    if (this.state !== connectionStates.READY && message) {
      this.canal.debug('ConnMan', 'Q  Queued message', message[0]);
      return this.messageQueue.push(message);
    }
    if (message) this._send(message);
    if (this.messageQueue.length) {
      this.send(this.messageQueue.shift());
    }
  }
  public close(code?: number, message?: string) {
    if (this.state === connectionStates.DEAD) return this.canal.debug('ConnMan', 'Refusing to close: already dead');
    this.canal.debug('ConnMan', 'Forcing client closed!', code, message);
    this.state = connectionStates.ENDING;
    this.ws.close(code || 1000, message || 'Goodbye');
    // Close will bubble back up in form of end/error event
  }

  private onOpen() {
    // We don't need to do anything when the connection opens. Server sends data first
  }
  private onReconnecting() {
    this.state = connectionStates.RECONNECTING;
    this.stopHeartbeat();
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
    this.canal.debug('ConnMan', '<  ' + eventName);
    if (eventName === 'HELLO') this.onHello(payload);
    else {
      if (eventName === 'READY') this.onReady(payload);
      this.emit('message', eventName, payload);
    }
  }
  private onEnd(reason?: Error | number) {
    if (this.state === connectionStates.DEAD) this.canal.debug('ConnMan', 'RecSock ended, not cleaning up as ConnMan is DEAD');
    else {
      this.canal.debug('ConnMan', 'RecSock has ended, cleaning up. ConnMan is currently', this.state);
      this.state = connectionStates.ENDING;
      this.cleanup(reason);
    }
  }

  // Heartbeating
  private setupHeartbeat(interval: number) {
    this.heartbeatRate = interval;
    this.heartbeatTimer = setInterval(() => this.doHeartbeat(), interval);
  }
  private doHeartbeat() {
    if (this.state === connectionStates.READY) this._send(['HEARTBEAT']);
  }
  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
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
    if (this.state !== connectionStates.ENDING) this.canal.debug('ConnMan', 'We\'re cleaning up, but not ending!');

    this.state = connectionStates.DEAD;
    if (this.messageQueue.length) this.messageQueue = [];
    this.stopHeartbeat();

    this.canal.debug('ConnMan', 'ConnMan has cleaned up, emitting end');
    this.emit('end', reason);
  }
  private _send(message: Message) {
    if (message[0] !== 'HEARTBEAT') this.canal.debug('ConnMan', '>  ' + message[0]);
    this.ws.send(this.serialize(message));
  }
  private serialize(d: Message): string {
    return JSON.stringify(d);
  }
  private deserialize(data: WebSocket.Data): Message {
    try {
      return JSON.parse(data.toString('utf8'));
    } catch (e) {
      this.canal.debug('ConnMan', 'Failed to deserialize frame:', data.toString());
      throw e;
    }
  }
}
