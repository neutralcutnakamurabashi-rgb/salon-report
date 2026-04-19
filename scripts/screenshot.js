#!/usr/bin/env node
/**
 * screenshot.js
 * 3店舗分のHTMLをPlaywrightでキャプチャしてPNG画像を生成する
 *
 * 出力:
 *   output/screenshot-sakuradai.png
 *   output/screenshot-fujimidai.png
 *   output/screenshot-nakamurashi.png
 *
 * 参考: progress-dashboard/scripts/take-screenshot.js
 * Chart.js白問題の対策:
 *   - waitUntil: 'networkidle' で描画完了まで待機
 *   - waitForFunction で window.__chartsReady フラグを確認
 *   - waitForTimeout(2000) で追加安定化
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORES = ['sakuradai', 'fujimidai', 'nakamurashi'];

const CONFIG = {
  width:       390,
  scale:       2,      // Retina対応（2倍解像度）
  waitMs:      2000,   // Chart.js描画安定化のための追加待機
  chartsTimeout: 10000, // __chartsReady フラグの最大待機時間
};

async function captureStore(page, storeId) {
  const htmlPath = path.resolve(__dirname, '..', 'output', `report-${storeId}.html`);
  const outputPath = path.resolve(__dirname, '..', 'output', `screenshot-${storeId}.png`);

  // HTMLファイルの存在確認
  await fs.access(htmlPath);

  console.log(`📸 ${storeId} をキャプチャ中...`);

  await page.goto(`file://${htmlPath}`, {
    waitUntil: 'networkidle',  // ネットワーク完了まで待つ（Google Fonts・CDN含む）
    timeout: 60000,
  });

  // Chart.js描画完了フラグを待つ（白くなるバグの防止）
  await page.waitForFunction(() => window.__chartsReady === true, {
    timeout: CONFIG.chartsTimeout,
  });

  // レイアウト安定化のための追加待機
  await page.waitForTimeout(CONFIG.waitMs);

  // reportCard の高さに合わせてビューポートを調整
  const contentHeight = await page.evaluate(() => {
    const card = document.getElementById('reportCard');
    if (card) {
      const rect = card.getBoundingClientRect();
      return Math.ceil(rect.height + 64); // body padding分を加算
    }
    return document.body.scrollHeight;
  });

  await page.setViewportSize({ width: CONFIG.width, height: contentHeight });
  await page.waitForTimeout(100);

  await page.screenshot({ path: outputPath, type: 'png' });
  console.log(`  ✅ output/screenshot-${storeId}.png を保存しました`);

  return outputPath;
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ja-JP'],
    });

    const context = await browser.newContext({
      viewport:        { width: CONFIG.width, height: 800 },
      deviceScaleFactor: CONFIG.scale,
      locale:          'ja-JP',
    });

    const page = await context.newPage();

    const outputPaths = [];
    for (const storeId of STORES) {
      const outputPath = await captureStore(page, storeId);
      outputPaths.push(outputPath);
    }

    // 撮影結果のパスを保存（post-line.js で参照する）
    await fs.writeFile(
      path.join(__dirname, '..', 'data', 'screenshot-paths.json'),
      JSON.stringify(outputPaths, null, 2)
    );

    console.log('\n✅ 3店舗分のスクリーンショットが完了しました');

  } catch (err) {
    if (err.message?.includes("Executable doesn't exist")) {
      console.error('❌ Chromiumがインストールされていません。以下を実行してください:');
      console.error('   npx playwright install chromium');
    } else {
      console.error('❌ エラー:', err.message);
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
