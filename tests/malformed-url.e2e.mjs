import { createConnection, createServer } from 'node:net';

const root = new URL('..', import.meta.url).pathname;

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not allocate test port'));
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitFor(check, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await check()) return; } catch {}
    await Bun.sleep(50);
  }
  throw new Error('Timed out waiting for temporary server');
}

function rawRequest(port, request) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let response = '';
    socket.setEncoding('utf8');
    socket.setTimeout(10_000, () => socket.destroy(new Error('Raw request timed out')));
    socket.on('connect', () => socket.write(request));
    socket.on('data', chunk => { response += chunk; });
    socket.on('end', () => resolve(response));
    socket.on('error', reject);
  });
}

const port = await freePort();
const server = Bun.spawn(['bun', 'run', 'server.ts'], {
  cwd: root,
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
  stdout: 'pipe',
  stderr: 'pipe',
});

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/api/health`)).ok);
  const target = '//[';
  const malformed = await rawRequest(port, `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
  const [headers, body = ''] = malformed.split('\r\n\r\n');
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  const result = { statusLine: headers.split('\r\n')[0], contentType: /\r\ncontent-type: ([^\r\n]+)/i.exec(headers)?.[1], noStore: /\r\ncache-control: no-store\b/i.test(headers), nosniff: /\r\nx-content-type-options: nosniff\b/i.test(headers), body: body.trim(), health: health.status, exitCode: server.exitCode ?? null };
  console.log(JSON.stringify(result, null, 2));
  if (!/^HTTP\/1\.1 400\b/.test(result.statusLine) || !/^application\/json; charset=utf-8$/i.test(result.contentType || '') || !result.noStore || !result.nosniff || result.body !== '{"error":"Invalid request URL"}' || result.health !== 200 || result.exitCode !== null) process.exitCode = 1;
} finally {
  server.kill();
  await server.exited;
}
