import { chromium } from 'playwright';
import { artifact, launchOptions } from './browser-runtime.mjs';

function installFailingBridge(page, mode) {
  return page.addInitScript((failureMode) => {
    const NativeWebSocket = globalThis.WebSocket;
    function FailingBridgeWebSocket(url, protocols) {
      if (new URL(String(url), location.href).pathname !== '/ws') {
        return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
      }
      const socket = {
        readyState: NativeWebSocket.CONNECTING,
        close() { this.readyState = NativeWebSocket.CLOSED; },
        send() { throw new Error('The forced WebSocket failure must use SSE instead'); },
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
      };
      queueMicrotask(() => {
        if (failureMode === 'first-event-timeout') {
          socket.readyState = NativeWebSocket.OPEN;
          socket.onopen?.(new Event('open'));
          return;
        }
        socket.readyState = NativeWebSocket.CLOSED;
        socket.onerror?.(new Event('error'));
        socket.onclose?.(new CloseEvent('close', { code: 1006 }));
      });
      return socket;
    }
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) FailingBridgeWebSocket[key] = NativeWebSocket[key];
    globalThis.WebSocket = FailingBridgeWebSocket;
  }, mode);
}

const browser = await chromium.launch(launchOptions());
const results = [];
try {
  for (const mode of ['error-close', 'first-event-timeout']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text());
    });
    await installFailingBridge(page, mode);
    await page.goto(`http://127.0.0.1:8899/?ws-failure=${mode}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const state = globalThis.__codexWebuiDebug?.state;
      return state?.transport === 'sse' && state.connected && state.models.length > 0;
    }, { timeout: 20_000 });
    const result = await page.evaluate(() => ({
      transport: globalThis.__codexWebuiDebug.state.transport,
      connected: globalThis.__codexWebuiDebug.state.connected,
      models: globalThis.__codexWebuiDebug.state.models.length,
      status: document.querySelector('#statusText')?.textContent?.trim(),
    }));
    await page.screenshot({ path: artifact(`ws-sse-fallback-${mode}.png`) });
    results.push({ mode, result, errors });
    await page.close();
  }
  console.log(JSON.stringify({ results }, null, 2));
  if (results.some(({ result, errors }) => result.transport !== 'sse' || !result.connected || !result.models || result.status !== 'Codex connected' || errors.length)) process.exitCode = 1;
} finally {
  await browser.close();
}
