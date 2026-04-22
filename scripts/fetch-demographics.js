#!/usr/bin/env node
/**
 * fetch-demographics.js
 * 「店舗別 年代別男女比一覧表」スプレッドシートの「客層データ」シートから
 * 各店舗の最新月の年代別男女データを取得する
 */

import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPREADSHEET_ID   = process.env.DEMOGRAPHICS_SPREADSHEET_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? './config/service-account.json';

// シート上の店舗名 → storeId
const STORE_MAP = {
  '富士見台': 'fujimidai',
  '中村橋':   'nakamurashi',
  '桜台':     'sakuradai',
};

const AGE_GROUPS = ['キッズ', '10代', '20代', '30代', '40代', '50代', '60代', '70代'];

async function getAuthClient() {
  const keyPath = path.resolve(__dirname, '..', SERVICE_ACCOUNT_KEY);
  const key = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

function parseNum(val) {
  const n = parseInt(String(val ?? '').trim(), 10);
  return isNaN(n) ? 0 : n;
}

async function main() {
  if (!SPREADSHEET_ID) {
    console.error('❌ DEMOGRAPHICS_SPREADSHEET_ID が設定されていません（.env を確認してください）');
    process.exit(1);
  }

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('📖 客層データシートを読み込み中...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '客層データ!A1:R200',
  });
  const rawRows = res.data.values ?? [];

  if (rawRows.length < 2) {
    console.error('❌ 客層データが見つかりません。');
    process.exit(1);
  }

  // ヘッダー行をスキップしてデータ行を処理
  const dataRows = rawRows.slice(1).filter(row => {
    if (!row[0] || !row[1]) return false;
    // 全ての数値が0の行（未入力月）を除外
    const nums = row.slice(2).map(v => parseNum(v));
    return nums.some(n => n > 0);
  });

  if (dataRows.length === 0) {
    console.error('❌ 有効なデータ行がありません。');
    process.exit(1);
  }

  console.log(`📊 有効データ行数: ${dataRows.length}行\n`);

  // 店舗ごとに最新月データを取得
  const storeLatest = {};

  for (const row of dataRows) {
    const month     = String(row[0]).trim();  // 例: "2026-01"
    const storeName = String(row[1]).trim();  // 例: "富士見台"
    const storeId   = STORE_MAP[storeName];
    if (!storeId) continue;

    // 同じ店舗の最新月を更新
    if (!storeLatest[storeId] || month > storeLatest[storeId].month) {
      storeLatest[storeId] = { month, row };
    }
  }

  // 結果を整形
  const result = {};

  for (const [storeId, { month, row }] of Object.entries(storeLatest)) {
    const ageGroups = AGE_GROUPS.map((label, i) => ({
      label,
      male:   parseNum(row[2 + i * 2]),
      female: parseNum(row[3 + i * 2]),
    }));

    const maleTotal   = ageGroups.reduce((s, g) => s + g.male,   0);
    const femaleTotal = ageGroups.reduce((s, g) => s + g.female, 0);
    const total       = maleTotal + femaleTotal;

    result[storeId] = { month, ageGroups, maleTotal, femaleTotal, total };

    console.log(`✅ ${storeId} (${month}): 合計${total}名 / 男${maleTotal}名 女${femaleTotal}名`);
  }

  const outputDir = path.join(__dirname, '..', 'data');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'demographics.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), stores: result }, null, 2)
  );

  console.log('\n💾 data/demographics.json に保存しました');
}

main().catch(err => { console.error(err); process.exit(1); });
