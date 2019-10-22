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
    this.ws.close(code, message);
    this.end();
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
    if (this.state === connectionStates.DEAD) return this.canal.debug('RecSock', 'Connection is already closed');
    if (this.isCodeFatal(code)) {
      this.canal.debug('RecSock', 'Fatal connection end, shutting down...');
      this.end(code);
    } else {
      this.startReconnect();
    }
  }

  private onError(e: Error) {
    this.canal.debug('RecSock', 'Socket error!', e);
    if (this.isErrorFatal(e)) {
      this.canal.debug('RecSock', 'Socket error is fatal, shutting down...');
      this.end();
    } else {
      this.startReconnect();
    }
  }

  private startReconnect() {
    this.state = connectionStates.RECONNECTING;
    const delay = this.backoffDuration * 2 ** this.reconnectAttempts;
    this.canal.debug('RecSock', 'Scheduling reconnect in', delay);
    this.reconnectAttempts++;
    this.emit('reconnecting');
    this.reconnectTimer = setTimeout(() => this.reconnect(), delay);
  }
  private reconnect() {
    this.canal.debug('RecSock', 'Reconnecting!');
    this.reconnectTimer = null;
    this.ws = new WebSocket(this.url);
    this.bindEventsToSocket();
  }

  private isCodeFatal(code: number) {
    // If we're giving up, or this is the first connection, or it's not a recoverable code
    return this.reconnectAttempts >= this.maxReconnectAttempts ||
      this.state === connectionStates.CONNECTING ||
      !recoverableCodes.includes(code);
  }
  private isErrorFatal(e: Error) {
    // TODO what errors should be fatal?
    // If we're giving up, or this is the first connection
    return this.reconnectAttempts >= this.maxReconnectAttempts ||
      this.state === connectionStates.CONNECTING;
  }

  private end(reason?: Error | number) {
    if (this.ws.readyState !== this.ws.CLOSED && this.ws.readyState !== this.ws.CLOSING) {
      this.canal.debug('RecSock', '!! Error: Ending, but socket is still open!', reason);
      this.ws.close(4000, 'errored, but socket was still open');
    }
    if (this.state === connectionStates.DEAD) return this.canal.debug('RecSock', 'end has been called too many times!');
    this.state = connectionStates.DEAD;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.canal.debug('RecSock', 'RecSock has cleaned up, emitting end');
    this.emit('end', reason);
  }
  // tslint:disable-next-line:member-ordering
  public send(d: WebSocket.Data) {
    if (this.ws) this.ws.send(d);
  }
  private onMessage(m: WebSocket.Data) {
    this.emit('message', m);
  }
}
