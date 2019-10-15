import * as EventEmitter from 'events';
import * as WebSocket from 'ws';

// If the connection is closed with one of these codes, don't attempt to reconnect
const fatalCloseCodes = [4004];

export default class ReconnectingSocket extends EventEmitter {
  private destroyed: boolean = false;
  private ws: WebSocket | null = null;
  private hasConnected: boolean = false;
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
    this.hasConnected = true;
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
    if (this.shouldReconnectWithCode(code)) {
      this.reconnect();
    } else {
      // Let's give up
      this.close(code, message); // Already closed, arguments are meaningless
      this.emit('close', code, message);
    }
  }
  private onMessage(m: WebSocket.Data) {
    this.emit('message', m);
  }
  private onError(e: Error) {
    if (this.shouldReconnectWithError(e)) {
      this.reconnect();
    } else {
      // Give up
      this.close(1000, 'Beep boop'); // Already closed, arguments are meaningless
      this.emit('error', e);
    }
  }

  private reconnect() {
    const delay = this.backoffDuration * 2 ** this.reconnectAttempts;
    this.reconnectAttempts++;
    this.emit('reconnecting');
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private shouldReconnectWithCode(code: number) {
    return this.reconnectAttempts < this.maxReconnectAttempts && !this.destroyed && this.hasConnected && !fatalCloseCodes.includes(code);
  }
  private shouldReconnectWithError(e: Error) {
    // TODO what errors should be fatal?
    return this.reconnectAttempts < this.maxReconnectAttempts && !this.destroyed && this.hasConnected;
  }
}
