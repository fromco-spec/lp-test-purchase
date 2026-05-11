import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export function makeRecorder(runDir) {
  const logPath = join(runDir, 'run.log');
  let stepIdx = 0;
  let currentPhase = null;

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
      // animations: 'disabled' でCSSアニメーションを停止状態にキャプチャ
      // (一部LP(pack即版など)のBotchanは永続アニメーションを持ち、デフォルト30sタイムアウトを誘発する)
      // timeout: 10s で「撮れないなら諦める」方針（スクショは診断目的、必須ではない）
      await page.screenshot({ path: file, fullPage: false, animations: 'disabled', timeout: 10000 });
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

  /**
   * 「フェーズ」(=ユーザーから見て意味のある工程) を区切る。
   * 失敗時にどのフェーズで詰まったか分かるようにエラーへ付与する。
   */
  async function phase(label, fn) {
    currentPhase = label;
    log(`──── ${label} ────`);
    try {
      return await fn();
    } catch (e) {
      if (!e.failedAtPhase) e.failedAtPhase = label;
      throw e;
    }
  }

  function getCurrentPhase() {
    return currentPhase;
  }

  return { log, step, dump, phase, getCurrentPhase };
}
