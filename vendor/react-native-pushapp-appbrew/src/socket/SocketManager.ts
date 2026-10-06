import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { sdkLog } from '../helpers/sdkLogger';

class SocketManager {
  private socket: Socket | null = null;
  private isConnected = false;
  // private appState: AppStateStatus = 'active';
  private appStateSubscription: { remove: () => void } | null = null;

  constructor() {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange
    );
  }

  init(url: string) {
    sdkLog.log('[SocketManager] Init called. Current socket:', !!this.socket);

    if (this.socket && this.isConnected) {
      sdkLog.log('[SocketManager] Already connected, skipping init.');
      return;
    }

    if (!this.socket) {
      this.socket = io(url, {
        transports: ['websocket'],
        autoConnect: false,
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        sdkLog.log('🟢 Socket connected');
        this.socket?.emit('add user', 'mehery-test-user');
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
        sdkLog.log('🔴 Socket disconnected');
      });

      this.socket.on('connect_error', (err) => {
        sdkLog.log('❌ Connection error:', err.message);
      });

      this.socket.on('login', (data) => {
        sdkLog.log('✅ Logged in:', data);
      });

      this.socket.on('new message', (data) => {
        sdkLog.log('💬 New message:', data);
      });
    }

    // Reconnect if not connected
    if (!this.isConnected) {
      sdkLog.log('[SocketManager] Calling socket.connect()...');
      this.socket.connect();
    }
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    // this.appState = nextAppState;

    if (nextAppState === 'active') {
      if (!this.isConnected) {
        sdkLog.log('🔁 App resumed, reconnecting socket...');
        this.socket?.connect();
      }
    } else if (nextAppState === 'background' || nextAppState === 'inactive') {
      sdkLog.log('📴 App backgrounded or inactive');
      // You can disconnect or keep the socket here depending on platform preference
      // this.socket?.disconnect();
    }
  };

  sendMessage(event: string, payload: any) {
    if (this.isConnected) {
      this.socket?.emit(event, payload);
    }
  }

  destroy() {
    this.socket?.disconnect();
    this.socket = null;
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
  }
}

export const socketManager = new SocketManager();
