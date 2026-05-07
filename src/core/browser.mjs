import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export async function launchBrowser({ scenarioName, headless = true } = {}) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T.]/g, '')
    .slice(0, 15);
  const runDir = join('artifacts', `${scenarioName}-${stamp}`);
  mkdirSync(runDir, { recursive: true });

  const browser = await chromium.launch({
    headless,
    slowMo: headless ? 0 : 100,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ja-JP',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  const page = await context.newPage();
  return { browser, context, page, runDir };
}

export async function closeBrowser({ browser, context, runDir }) {
  await context.tracing.stop({ path: join(runDir, 'trace.zip') });
  await browser.close();
}
