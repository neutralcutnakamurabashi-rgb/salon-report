#!/usr/bin/env node
/**
 * post-line.js
 * 3店舗分のスクリーンショットをLINEへ送信する
 *
 * LINEへの画像送信は「公開URL」が必須のため、Surgeで一時公開してからURLを渡す。
 * 参考: morning-line-bot/src/line.gs の callLineApi_ パターン
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LINE_API_BASE    = 'https://api.line.me/v2/bot';
const CHANNEL_TOKEN    = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const GROUP_ID         = process.env.LINE_GROUP_ID;
const SURGE_DOMAIN     = process.env.SURGE_DOMAIN;
const SURGE_LOGIN      = process.env.SURGE_LOGIN;
const SURGE_TOKEN      = process.env.SURGE_TOKEN;

// ① SurgeにoutputフォルダをデプロイしてベースURLを返す
async function deployToSurge() {
  console.log('🚀 Surgeにデプロイ中...');
  const outputDir = path.join(__dirname, '..', 'output');
  execSync(
    `SURGE_LOGIN=${SURGE_LOGIN} SURGE_TOKEN=${SURGE_TOKEN} npx surge ${outputDir} ${SURGE_DOMAIN} --quiet`,
    { stdio: 'inherit' }
  );
  const baseUrl = `https://${SURGE_DOMAIN}`;
  console.log(`  ✅ ${baseUrl}`);
  return baseUrl;
}

// ② LINEに画像メッセージを送信する
async function pushImageMessage(imageUrl) {
  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${CHANNEL_TOKEN}`,
    },
    body: JSON.stringify({
      to: GROUP_ID,
      messages: [{
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl:    imageUrl,
      }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE API エラー ${res.status}: ${body}`);
  }
}

// ③ テキストメッセージ（ヘッダー・フッター）を送信する
async function pushTextMessage(text) {
  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${CHANNEL_TOKEN}`,
    },
    body: JSON.stringify({
      to: GROUP_ID,
      messages: [{ type: 'text', text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE API エラー ${res.status}: ${body}`);
  }
}

async function main() {
  if (!CHANNEL_TOKEN) { console.error('❌ LINE_CHANNEL_ACCESS_TOKEN が未設定'); process.exit(1); }
  if (!GROUP_ID)      { console.error('❌ LINE_GROUP_ID が未設定');              process.exit(1); }
  if (!SURGE_DOMAIN)  { console.error('❌ SURGE_DOMAIN が未設定');               process.exit(1); }

  // スクリーンショットのパスを読み込む
  const screenshotPaths = JSON.parse(
    await fs.readFile(path.join(__dirname, '..', 'data', 'screenshot-paths.json'), 'utf-8')
  );

  // Surgeにデプロイ
  const baseUrl = await deployToSurge();

  // 月を取得
  const now = new Date();
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月度`;

  // ヘッダーメッセージ
  await pushTextMessage(`📊 ${monthLabel} 月次レポート\n3店舗分をお届けします。`);
  console.log('✅ ヘッダーメッセージ送信');

  // 店舗ごとに画像を送信
  const storeLabels = { sakuradai: '桜台店', fujimidai: '富士見台店', nakamurashi: '中村橋店' };
  for (const filePath of screenshotPaths) {
    const filename = path.basename(filePath); // screenshot-sakuradai.png
    const imageUrl = `${baseUrl}/${filename}?t=${Date.now()}`;
    const storeId  = filename.replace('screenshot-', '').replace('.png', '');

    console.log(`📤 ${storeLabels[storeId] ?? storeId} を送信中...`);
    await pushImageMessage(imageUrl);
    console.log(`  ✅ 送信完了`);

    // LINE APIのレート制限対策（1秒待機）
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n🎉 全店舗のレポートをLINEへ送信しました！');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
