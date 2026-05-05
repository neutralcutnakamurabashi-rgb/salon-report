#!/usr/bin/env node
/**
 * fetch-store-sales.js
 * 各店舗の日別売上スプレッドシートから当月・前月の合計（N35）を取得する
 * シート名は「4月」「3月」などの月名形式
 */

import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? './config/service-account.json';

const STORES = [
  { id: 'fujimidai',   name: '富士見台店', envKey: 'FUJIMIDAI_SALES_ID'   },
  { id: 'nakamurashi', name: '中村橋店',   envKey: 'NAKAMURASHI_SALES_ID' },
  { id: 'sakuradai',   name: '桜台店',     envKey: 'SAKURADAI_SALES_ID'   },
];

async function getAuthClient() {
  const keyPath = path.resolve(__dirname, '..', SERVICE_ACCOUNT_KEY);
  const key = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

function parseNum(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = parseFloat(String(val).replace(/,/g, '').replace(/¥/g, '').replace(/\\/g, '').trim());
  return isNaN(num) ? null : num;
}

// 今月（報告対象月）と前月のシート名を返す
// 5月に実行 → 報告対象 = 4月、前月 = 3月
function getSheetNames() {
  const now = new Date();
  const reportMonthNum = now.getMonth(); // 0=Jan, so getMonth() in May(5) = 4 = April
  const prevMonthNum   = reportMonthNum === 0 ? 12 : reportMonthNum;
  return {
    current: `${reportMonthNum}月`,   // "4月"
    prev:    `${prevMonthNum - 1}月`, // "3月"
    currentMonthLabel: `2026-${String(reportMonthNum).padStart(2, '0')}`,
  };
}

async function fetchSalesForStore(sheets, store, sheetName) {
  const spreadsheetId = process.env[store.envKey];
  if (!spreadsheetId) {
    console.warn(`⚠️  ${store.envKey} が未設定です`);
    return null;
  }
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!N35`,
    });
    const val = res.data.values?.[0]?.[0];
    const num = parseNum(val);
    console.log(`  ${store.name} [${sheetName}] N35 = ${val} → ${num}`);
    return num;
  } catch (e) {
    console.warn(`  ⚠️  ${store.name} [${sheetName}] 取得失敗: ${e.message}`);
    return null;
  }
}

async function main() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const { current, prev, currentMonthLabel } = getSheetNames();
  console.log(`📅 当月シート: ${current}  /  前月シート: ${prev}\n`);

  const results = [];

  for (const store of STORES) {
    console.log(`🏪 ${store.name} を取得中...`);
    const currentSales = await fetchSalesForStore(sheets, store, current);
    const prevSales    = await fetchSalesForStore(sheets, store, prev);
    results.push({
      storeId: store.id,
      storeName: store.name,
      currentMonth: currentMonthLabel,
      currentSales,
      prevSales,
    });
  }

  const total = {
    current: results.reduce((s, r) => s + (r.currentSales ?? 0), 0),
    prev:    results.reduce((s, r) => s + (r.prevSales    ?? 0), 0),
  };
  console.log(`\n📊 全社合計: 当月 ¥${total.current.toLocaleString()} / 前月 ¥${total.prev.toLocaleString()}`);

  const outputDir = path.join(__dirname, '..', 'data');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'store-sales.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), currentMonth: currentMonthLabel, stores: results, total }, null, 2)
  );
  console.log('💾 data/store-sales.json に保存しました');
}

main().catch(err => { console.error(err); process.exit(1); });
