const mockAppStateHandlers: Array<(s: string) => void> = [];
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: (_: string, cb: (s: string) => void) => {
      mockAppStateHandlers.push(cb);
    },
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => (k === 'device_id' ? 'dev1' : null)),
}));
let mockUserId = 'guest_1';
jest.mock('../utils/user', () => ({
  waitForEffectiveUserId: jest.fn(async () => mockUserId),
}));
jest.mock('../helpers/tenantContext', () => ({
  getWsHostUrl: jest.fn(async () => 'wss://example/test'),
}));
jest.mock('../events/custom/CustomEvents', () => ({
  handleWebSocketPollSignal: jest.fn(),
}));
jest.mock('../helpers/sdkLogger', () => ({
  sdkLog: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onmessage: unknown = null;
  onerror: unknown = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(m: string) {
    this.sent.push(m);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
}
(global as any).WebSocket = FakeWebSocket;

import { connectToServer, reauthenticateWebSocket } from '../socket/WebSock';

function ws(i: number): FakeWebSocket {
  const instance = FakeWebSocket.instances[i];
  if (!instance) throw new Error(`no WebSocket #${i}`);
  return instance;
}

describe('WebSocket reconnect', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('still reconnects after a login swapped the socket (flag must not stick)', async () => {
    await connectToServer();
    ws(0).open();

    mockUserId = 'cust_9';
    await reauthenticateWebSocket();
    const afterLogin = FakeWebSocket.instances.length;
    ws(afterLogin - 1).open();

    // iOS closes the socket, e.g. when the app is backgrounded.
    ws(afterLogin - 1).onclose?.({
      code: 1001,
      reason: 'Stream end encountered',
    });
    await jest.advanceTimersByTimeAsync(5100);

    expect(FakeWebSocket.instances.length).toBe(afterLogin + 1);
  });

  it('reconnects when the app returns to the foreground with no socket', async () => {
    const before = FakeWebSocket.instances.length;
    ws(before - 1).readyState = 3;
    mockAppStateHandlers.forEach((h) => h('active'));
    await jest.advanceTimersByTimeAsync(10);
    expect(FakeWebSocket.instances.length).toBeGreaterThan(before);
  });
});
