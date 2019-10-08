import * as EventEmitter from 'events';
import * as WebSocket from 'ws';

// If the connection is closed with one of these codes, don't attempt to reconnect
const fatalCloseCodes = [4004];

export default class ReconnectingSocket extends EventEmitter {
  private destroyed: boolean = false;
  private ws: WebSocket | null = null;
  // Connection attempts since last successful connection
  private reconnectTimer: NodeJS.Timer | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private backoffDuration: number = 5000;

  constructor(public url: string) {
    super();
    this.connect();
  }

  public connect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws = new WebSocket(this.url);
    this.ws.on('open', () => this.onOpen());
    this.ws.on('close', (code, message) => this.onClose(code, message));
    this.ws.on('message', (message) => this.onMessage(message));
    this.ws.on('error', (err) => this.onError(err));
  }
  public resetErrorCount() {
    this.reconnectAttempts = 0;
  }
  public send(d: WebSocket.Data) {
    if (this.ws) this.ws.send(d);
  }
  public close(code: number, message: string) {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close(code, message);
  }

  private onOpen() {
    this.emit('open'); // Yay, we've connected!
  }
  private onClose(code: number, message: string) {
    if (this.isFatalCode(code)) {
      // Let's give up
      this.emit('close', code, message);
    } else {
      this.reconnect();
    }
  }
  private onMessage(m: WebSocket.Data) {
    this.emit('message', m);
  }
  private onError(e: Error) {
    if (this.isFatalError(e)) {
      // Give up
      this.emit('error', e);
    } else {
      this.reconnect();
    }
  }

  private reconnect() {
    const delay = this.backoffDuration * 2 ** this.reconnectAttempts;
    this.reconnectAttempts++;
    this.emit('reconnecting');
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private isFatalCode(code: number) {
    return this.reconnectAttempts >= this.maxReconnectAttempts || this.destroyed || fatalCloseCodes.includes(code);
  }
  private isFatalError(e: Error) {
    // TODO what errors should be fatal?
    return this.reconnectAttempts >= this.maxReconnectAttempts || this.destroyed;
  }
}
