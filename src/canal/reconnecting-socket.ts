import * as EventEmitter from 'events';
import * as WebSocket from 'ws';
import {ConnectionState, connectionStates} from './constants';
import Canal from './index';

// If the connection is closed with one of these codes, we can try reconnecting
// 1006 - Likely a connection timeout
const recoverableCodes: number[] = [1006];

export default class ReconnectingSocket extends EventEmitter {
  public state: ConnectionState;
  private ws: WebSocket;
  // Connection attempts since last successful connection
  private reconnectTimer: NodeJS.Timer | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private backoffDuration: number = 5000;

  constructor(public url: string, private canal: Canal) {
    super();
    this.canal.debug('RecSock', 'Initialising connection to', url);
    this.state = connectionStates.CONNECTING;
    this.ws = new WebSocket(this.url);
    this.bindEventsToSocket();
  }

  public bindEventsToSocket() {
    this.ws.on('open', () => this.onOpen());
    this.ws.on('close', (code, message) => this.onClose(code, message));
    this.ws.on('message', (message) => this.onMessage(message));
    this.ws.on('error', (err) => this.onError(err));
  }

  // Only call when the connection is open to terminate it permanently
  public close(code: number, message: string) {
    this.canal.debug('RecSock', 'Forcing closed...', code, message);
    this.state = connectionStates.ENDING;
    this.ws.close(code, message);
    this.end(code);
  }
  // Mark the connection as successful and everything as ok
  public didReady() {
    this.reconnectAttempts = 0;
  }

  private onOpen() {
    this.state = connectionStates.READY;
    this.emit('open'); // Yay, we've connected!
  }
  private onClose(code: number, message: string) {
    this.canal.debug('RecSock', 'Remote host has closed websocket', code, message);
    if (this.state === connectionStates.DEAD) return this.canal.debug('RecSock', 'Closing after dead. Assuming we\'ve already cleaned up');
    if (this.isCodeRecoverable(code)) {
      this.startReconnect();
    } else {
      this.canal.debug('RecSock', 'Fatal connection end, shutting down...');
      this.state = connectionStates.ENDING;
      this.end(code);
    }
  }
  private onError(e: Error) {
    this.canal.debug('RecSock', 'Socket error!', e);
    if (this.state === connectionStates.DEAD) return this.canal.debug('RecSock', 'Error after connection is dead. Ignoring.');
    if (this.isErrorRecoverable(e)) {
      this.startReconnect();
    } else {
      this.canal.debug('RecSock', 'Socket error is fatal, shutting down...');
      this.state = connectionStates.ENDING;
      this.end();
    }
  }

  private startReconnect() {
    if (this.state === connectionStates.DEAD) return this.canal.debug('RecSock', 'Refusing to reconnect: dead');
    if (this.state === connectionStates.ENDING) return this.canal.debug('RecSock', 'Refusing to reconnect: currently ending');
    if (this.reconnectTimer) return this.canal.debug('RecSock', 'Refusing to reconnect: already reconnecting');
    this.state = connectionStates.RECONNECTING;
    const delay = this.backoffDuration * 2 ** this.reconnectAttempts;
    this.canal.debug('RecSock', 'Scheduling reconnect in', delay);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.reconnect(), delay);
    this.emit('reconnecting');
  }
  private reconnect() {
    this.canal.debug('RecSock', 'Reconnecting!');
    this.reconnectTimer = null;
    this.ws = new WebSocket(this.url);
    this.bindEventsToSocket();
  }

  private isCodeRecoverable(code: number) {
    return this.reconnectAttempts < this.maxReconnectAttempts // If we aren't giving up
      || this.state === 'READY' || this.state === 'RECONNECTING'
      || recoverableCodes.includes(code); // If we are in a healthy state, or retrying
  }
  private isErrorRecoverable(e: Error) {
    return this.reconnectAttempts < this.maxReconnectAttempts // If we aren't giving up
      || this.state === 'READY' || this.state === 'RECONNECTING'; // If we are in a healthy state, or retrying
  }

  private end(reason?: Error | number) {
    if (this.ws.readyState !== this.ws.CLOSED && this.ws.readyState !== this.ws.CLOSING) {
      this.canal.debug('RecSock', '!! Error: Ending, but socket is still open!', reason);
      this.ws.close(4000, 'errored, but socket was still open');
    }
    if (this.state === connectionStates.DEAD) return this.canal.debug('RecSock', 'end has been called too many times!');
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.state = connectionStates.DEAD;
    this.canal.debug('RecSock', 'RecSock has cleaned up, emitting end');
    this.emit('end', reason);
  }
  // tslint:disable-next-line:member-ordering
  public send(d: WebSocket.Data) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(d);
    else this.canal.debug('RecSock', 'Trying to send data to a unready connection', d.toString());
  }
  private onMessage(m: WebSocket.Data) {
    this.emit('message', m);
  }
}
