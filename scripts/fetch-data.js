#!/usr/bin/env node
/**
 * fetch-data.js
 * Googleスプレッドシートから3店舗の月次データを取得する
 *
 * 取得するデータ（各店舗シート）:
 *   - 売上合計・前月・前年同月
 *   - 客数・前月・前年同月
 *   - 客単価
 *   - 人件費（金額）・営業時間・総勤務時間
 *   - 直近6ヶ月の売上推移
 *   - 年代×性別の客層データ
 */

import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? './config/service-account.json';

// 店舗ごとのシート名（スプレッドシートに合わせて変更）
const STORES = [
  { id: 'sakuradai',    name: '桜台店',   sheet: '桜台店' },
  { id: 'fujimidai',   name: '富士見台店', sheet: '富士見台店' },
  { id: 'nakamurashi', name: '中村橋店',  sheet: '中村橋店' },
];

async function getAuthClient() {
  const keyPath = path.resolve(__dirname, '..', SERVICE_ACCOUNT_KEY);
  const key = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

async function fetchStoreData(sheets, store) {
  console.log(`📊 ${store.name} のデータを取得中...`);

  // TODO: スプレッドシートの実際のレイアウトに合わせて範囲を指定する
  // 現在はプレースホルダー。Step 3（スプレッドシート連携）で実装する。
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${store.sheet}!A1:Z100`,
  });

  const rows = res.data.values ?? [];
  console.log(`  ✅ ${rows.length}行取得`);

  // TODO: rows から各KPIを抽出するパース処理を実装する
  // 暫定データ（モックアップと同じ値）
  return {
    storeId:   store.id,
    storeName: store.name,
    month:     getCurrentMonth(),
    kpi: {
      sales:          { current: 0, prevMonth: 0, prevYear: 0 },
      customers:      { current: 0, prevMonth: 0, prevYear: 0 },
      unitPrice:      { current: 0, prevMonth: 0 },
      laborCostRate:  { current: 0 },
      salesPerHour:   0,
      laborProductivity: 0,
      operatingHours: 0,
      totalWorkHours: 0,
    },
    salesHistory: [],  // 直近6ヶ月 [{ month: '9月', sales: 95.2 }, ...]
    ageGender: {       // 年代×性別
      male:   { teen: 0, twenties: 0, thirties: 0, forties: 0, fifties: 0, sixtyPlus: 0 },
      female: { teen: 0, twenties: 0, thirties: 0, forties: 0, fifties: 0, sixtyPlus: 0 },
    },
    rawRows: rows,
  };
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月度`;
}

async function main() {
  if (!SPREADSHEET_ID) {
    console.error('❌ SPREADSHEET_ID が設定されていません（.env を確認してください）');
    process.exit(1);
  }

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const results = [];
  for (const store of STORES) {
    const data = await fetchStoreData(sheets, store);
    results.push(data);
  }

  const outputDir = path.join(__dirname, '..', 'data');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'store-data.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), stores: results }, null, 2)
  );

  console.log('\n💾 data/store-data.json に保存しました');
}

main().catch(err => { console.error(err); process.exit(1); });
