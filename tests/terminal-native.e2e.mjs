import { existsSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';

const chrome = process.env.PLAYWRIGHT_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary',
].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const vimFile = '/tmp/codex-webui-terminal-vim-test.txt';
rmSync(vimFile, { force: true });
await page.goto(process.env.CODEX_WEBUI_TEST_URL || 'http://127.0.0.1:8899', { waitUntil: 'networkidle' });
await page.fill('#prompt', '检查输入框横线与终端键盘支持');

const composer = await page.evaluate(() => ({
  value: document.querySelector('#prompt')?.value,
  borderTop: getComputedStyle(document.querySelector('.composer-dock')).borderTop,
}));

await page.click('#toggleBottomPanel');
await page.click('[data-bottom-panel-action="terminal"]');
await page.waitForSelector('#terminalHost .xterm', { timeout: 10_000 });
await page.locator('#terminalHost .xterm-helper-textarea').focus();
await page.keyboard.type("printf '\\033[31mANSI_RED\\033[0m \\033[32mANSI_GREEN\\033[0m\\n'");
await page.keyboard.press('Enter');
await page.waitForFunction(() => {
  const term = globalThis.__codexTerminal?.term;
  return term && [...Array(term.buffer.active.length)].some((_, index) => term.buffer.active.getLine(index)?.translateToString(true).includes('ANSI_RED ANSI_GREEN'));
});

const ansi = await page.evaluate(() => {
  const row = [...document.querySelectorAll('#terminalHost .xterm-rows > div')].find(node => node.textContent?.includes('ANSI_RED') && !node.textContent.includes('printf'));
  const spans = [...(row?.querySelectorAll('span') || [])];
  const red = spans.find(node => node.textContent?.includes('ANSI_RED'));
  const green = spans.find(node => node.textContent?.includes('ANSI_GREEN'));
  return {
    red: red ? getComputedStyle(red).color : null,
    green: green ? getComputedStyle(green).color : null,
    text: row?.textContent || '',
  };
});

await page.keyboard.type(`vim ${vimFile}`);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.keyboard.press('i');
await page.keyboard.type('value=10');
await page.keyboard.press('Enter');
await page.keyboard.type('second');
await page.keyboard.press('Enter');
await page.keyboard.type('third');
await page.keyboard.press('Escape');
await page.keyboard.type('gg0');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('Control+x');
await page.keyboard.press('A');
await page.keyboard.type(' CTRL_C_OK');
await page.keyboard.press('Control+c');
await page.keyboard.type(':wq');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('#terminalHost')?.textContent?.includes('value=9'), null, { timeout: 10_000 }).catch(() => {});

await page.keyboard.type(`printf 'VIM_FILE='; cat ${vimFile}`);
await page.keyboard.press('Enter');
await page.waitForFunction(() => {
  const term = globalThis.__codexTerminal?.term;
  return term && [...Array(term.buffer.active.length)].some((_, index) => term.buffer.active.getLine(index)?.translateToString(true).includes('VIM_FILE=value=9 CTRL_C_OK'));
}, null, { timeout: 10_000 });

const terminal = await page.evaluate(() => ({
  title: document.querySelector('#bottomPanelTab')?.textContent?.trim(),
  xterm: Boolean(document.querySelector('#terminalHost .xterm')),
  rows: document.querySelector('#terminalHost .xterm-rows')?.textContent || '',
  connected: document.querySelector('#terminalHost')?.dataset.connected,
}));

console.log(JSON.stringify({ composer, ansi, terminal, errors }, null, 2));
await page.screenshot({ path: '.artifacts/terminal-open.png' });
await browser.close();

if (composer.value !== '检查输入框横线与终端键盘支持') process.exit(1);
if (composer.borderTop !== '0px none rgb(242, 242, 242)' && !composer.borderTop.startsWith('0px')) process.exit(1);
if (!terminal.xterm || terminal.title !== 'Terminal' || terminal.connected !== 'true') process.exit(1);
if (!ansi.text.includes('ANSI_RED') || !ansi.text.includes('ANSI_GREEN') || ansi.red === ansi.green) process.exit(1);
if (!terminal.rows.includes('VIM_FILE=value=9 CTRL_C_OK') || errors.length) process.exit(1);
