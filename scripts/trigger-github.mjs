/**
 * GitHub Actions ワークフローをAPIで起動するスクリプト
 *
 * 使い方:
 *   node scripts/trigger-github.mjs <notion_lp_page_id>
 *
 * 必要な環境変数（.env）:
 *   GITHUB_REPO    "owner/repo" の形式 (例: androots/lp-test-purchase)
 *   GITHUB_TOKEN   Personal Access Token (repo スコープ)
 */
import 'dotenv/config';

const REPO = process.env.GITHUB_REPO;
const TOKEN = process.env.GITHUB_TOKEN;
const lpId = process.argv[2];

if (!REPO || !TOKEN) {
  console.error('✗ GITHUB_REPO / GITHUB_TOKEN が .env に設定されていません');
  process.exit(1);
}
if (!lpId) {
  console.error('使い方: node scripts/trigger-github.mjs <notion_lp_page_id>');
  process.exit(1);
}

const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    event_type: 'run_test_purchase',
    client_payload: { lp_id: lpId, trigger: 'API' },
  }),
});

if (res.status === 204) {
  console.log(`✓ GitHub Actionsをトリガーしました（lp_id=${lpId}）`);
  console.log(`  実行状況: https://github.com/${REPO}/actions`);
} else {
  console.error(`✗ Failed: ${res.status}`);
  console.error(await res.text());
  process.exit(1);
}
