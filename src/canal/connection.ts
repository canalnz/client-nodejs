import {EventEmitter} from 'events';
import * as WebSocket from 'ws';

type Message = [string, any];

class CanalConnection extends EventEmitter {
  private ws: WebSocket;
  private heartbeatInterval: number = 1000; // Will be overwritten in core.hello event
  private heartbeatTimer: NodeJS.Timer | null = null;

  constructor(public readonly gatewayUrl: string) {
    super();
    this.ws = new WebSocket(this.gatewayUrl);
    this.ws.on('open', (...args) => this.connectionCreated(...args));
    this.ws.on('message', (...args) => this.messageReceived(...args));
    this.ws.on('close', (...args) => this.connectionClosed(...args));
    this.ws.on('error', (...args) => this.connectionError(...args));
    // First message will be hello
    this.once('message', (_, payload) => this.setupHeartbeat(payload.heartbeat));
  }

  public send(eventName: string, payload?: any) {
    console.log(`> ${eventName}`);
    if (!payload) this.ws.send(this.serialize([eventName]));
    else this.ws.send(this.serialize([eventName, payload]));
  }
  public close(code: number = 1000) {
    console.log('beep boop, let\'s close the connection');
    this.ws.close(code);
  }

  private setupHeartbeat(heartbeat: number) {
    heartbeat = Math.max(500, heartbeat); // Prevent overwhemling everything
    this.heartbeatTimer = setInterval(() => this.send('HEARTBEAT'), heartbeat);
  }
  private connectionCreated() {
    this.emit('connected');
  }
  private messageReceived(data: WebSocket.Data) {
    const [eventName, payload] = this.deserialize(data);
    console.log(`< ${eventName}`);
    this.emit('message', eventName, payload);
  }
  private connectionClosed(code: number, message: string) {
    this.emit('closed', [code, message]);
  }
  private connectionError(e: Error) {
    this.emit('error', e);
  }
  private serialize(d: any): string {
    return JSON.stringify(d);
  }
  private deserialize(data: WebSocket.Data): Message {
    return JSON.parse(data.toString('utf8'));
  }
}

export default CanalConnection;
