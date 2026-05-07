import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export function makeRecorder(runDir) {
  const logPath = join(runDir, 'run.log');
  let stepIdx = 0;

  function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    process.stdout.write(line);
    appendFileSync(logPath, line);
  }

  async function step(page, label) {
    stepIdx += 1;
    const idx = String(stepIdx).padStart(3, '0');
    const safe = label.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
    const file = join(runDir, `${idx}_${safe}.png`);
    try {
      await page.screenshot({ path: file, fullPage: false });
      log(`step ${idx}: ${label} → ${file}`);
    } catch (e) {
      log(`step ${idx}: ${label} (screenshot failed: ${e.message})`);
    }
    return file;
  }

  function dump(name, data) {
    const file = join(runDir, `${name}.json`);
    writeFileSync(file, JSON.stringify(data, null, 2));
    log(`dump → ${file}`);
  }

  return { log, step, dump };
}
