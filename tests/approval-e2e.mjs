import { chromium } from 'playwright';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { artifact, launchOptions } from './browser-runtime.mjs';

const config = await fetch('http://127.0.0.1:8899/api/config').then(response => response.json());
const proof = join(dirname(config.defaultCwd), `.codex-webui-approval-e2e-${process.pid}.txt`);
rmSync(proof, { force: true });
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text());
});
try {
  await page.goto('http://127.0.0.1:8899', { waitUntil: 'networkidle' });
  await page.locator('#newTask').click();
  const prompt = `Run exactly this terminal command now, without changing it and without using another method:\nprintf 'APPROVAL_E2E_OK\\n' > ${proof}\nDo not only describe the command. Execute it and then briefly confirm completion.`;
  await page.locator('#prompt').fill(prompt);
  await page.locator('#composer').evaluate(form => form.requestSubmit());
  const card = page.locator('[data-codex-approval-surface]').filter({ hasText: proof });
  await card.first().waitFor({ state: 'visible', timeout: 120_000 });
  const matchingCards = await card.count();
  if (matchingCards !== 1) throw new Error(`Expected one approval for ${proof}, got ${matchingCards}`);
  const approval = await card.evaluate(node => {
    const turn = node.closest('.native-turn-timeline');
    return {
      identity: node.querySelector('.approval-identity')?.textContent?.trim(),
      title: node.querySelector('.approval-title')?.textContent?.trim(),
      status: turn?.querySelector('.activity-summary-copy')?.textContent?.trim(),
      activityLabel: turn?.querySelector('.activity-name')?.textContent?.trim(),
      buttons: [...node.querySelectorAll('button')].map(button => button.textContent.trim()).filter(Boolean),
    };
  });
  await page.screenshot({ path: artifact('approval-e2e-waiting.png') });
  await card.locator('.approval-primary').click();
  await page.waitForFunction(path => fetch('/api/health').then(() => true), proof, { timeout: 5_000 });
  const deadline = Date.now() + 120_000;
  while (!existsSync(proof) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 500));
  if (!existsSync(proof)) throw new Error('Approved command did not create the proof file');
  const content = readFileSync(proof, 'utf8').trim();
  if (content !== 'APPROVAL_E2E_OK') throw new Error(`Unexpected proof content: ${content}`);
  await page.screenshot({ path: artifact('approval-e2e-completed.png') });
  console.log(JSON.stringify({ approval, content, errors }, null, 2));
  if (approval.status !== 'Waiting for approval' || approval.activityLabel === 'Waiting for approval') throw new Error(`Redundant approval state: ${JSON.stringify(approval)}`);
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
} finally {
  rmSync(proof, { force: true });
  await browser.close();
}
