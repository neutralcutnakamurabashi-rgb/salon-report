#!/usr/bin/env node
/**
 * fetch-data.js
 * 「レポートデータ」シートから3店舗の月次データを取得する
 *
 * 取得するデータ:
 *   - 最新月の各KPI（売上・客数・人件費率・時間売上・労働生産性）
 *   - 前月・前年同月との比較値
 *   - 直近6ヶ月の売上推移
 *   - 客単価（売上 ÷ 客数）
 */

import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? './config/service-account.json';

// 列インデックス（0始まり）
const COL = {
  MONTH:                  0,
  FUJIMIDAI_SALES:        1,
  FUJIMIDAI_CUSTOMERS:    2,
  FUJIMIDAI_LABOR_RATE:   3,
  FUJIMIDAI_SALES_HOUR:   4,
  FUJIMIDAI_LABOR_PROD:   5,
  NAKAMURASHI_SALES:      6,
  NAKAMURASHI_CUSTOMERS:  7,
  NAKAMURASHI_LABOR_RATE: 8,
  NAKAMURASHI_SALES_HOUR: 9,
  NAKAMURASHI_LABOR_PROD: 10,
  SAKURADAI_SALES:        11,
  SAKURADAI_CUSTOMERS:    12,
  SAKURADAI_LABOR_RATE:   13,
  SAKURADAI_SALES_HOUR:   14,
  SAKURADAI_LABOR_PROD:   15,
};

const STORES = [
  {
    id: 'fujimidai', name: '富士見台店',
    cols: {
      sales: COL.FUJIMIDAI_SALES,   customers: COL.FUJIMIDAI_CUSTOMERS,
      rate:  COL.FUJIMIDAI_LABOR_RATE, hour: COL.FUJIMIDAI_SALES_HOUR,
      prod:  COL.FUJIMIDAI_LABOR_PROD,
    },
  },
  {
    id: 'nakamurashi', name: '中村橋店',
    cols: {
      sales: COL.NAKAMURASHI_SALES,   customers: COL.NAKAMURASHI_CUSTOMERS,
      rate:  COL.NAKAMURASHI_LABOR_RATE, hour: COL.NAKAMURASHI_SALES_HOUR,
      prod:  COL.NAKAMURASHI_LABOR_PROD,
    },
  },
  {
    id: 'sakuradai', name: '桜台店',
    cols: {
      sales: COL.SAKURADAI_SALES,   customers: COL.SAKURADAI_CUSTOMERS,
      rate:  COL.SAKURADAI_LABOR_RATE, hour: COL.SAKURADAI_SALES_HOUR,
      prod:  COL.SAKURADAI_LABOR_PROD,
    },
  },
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
  const num = parseFloat(String(val).replace(/,/g, '').replace(/%/g, '').trim());
  return isNaN(num) ? null : num;
}

// "2026-02" → "2026-01"、"2026-01" → "2025-12"
function prevMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  if (mo === 1) return `${y - 1}-12`;
  return `${y}-${String(mo - 1).padStart(2, '0')}`;
}

// "2026-02" → "2025-02"
function prevYear(m) {
  const [y, mo] = m.split('-');
  return `${parseInt(y) - 1}-${mo}`;
}

// "2025-08" → "8月"
function monthLabel(m) {
  return `${parseInt(m.split('-')[1])}月`;
}

function extractStoreData(dataMap, month, store) {
  const row = dataMap[month];
  if (!row) return null;
  const c = store.cols;
  return {
    sales:     parseNum(row[c.sales]),
    customers: parseNum(row[c.customers]),
    rate:      parseNum(row[c.rate]),
    hour:      parseNum(row[c.hour]),
    prod:      parseNum(row[c.prod]),
  };
}

async function main() {
  if (!SPREADSHEET_ID) {
    console.error('❌ SPREADSHEET_ID が設定されていません（.env を確認してください）');
    process.exit(1);
  }

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('📖 レポートデータシートを読み込み中...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'レポートデータ!A1:P100',
  });
  const rawRows = res.data.values ?? [];

  if (rawRows.length < 2) {
    console.error('❌ データが見つかりません。先に migrate-data.js を実行してください。');
    process.exit(1);
  }

  // ヘッダー行を除いたデータ行を月→行のマップに変換
  const dataRows = rawRows.slice(1).filter(row => row[0] && row[0] !== '年月');
  const dataMap = {};
  for (const row of dataRows) {
    dataMap[row[0]] = row;
  }

  // 全月をソートし最新月を特定
  const allMonths = Object.keys(dataMap).sort();
  const latestMonth = allMonths[allMonths.length - 1];

  console.log(`📅 最新月: ${latestMonth}`);
  console.log(`📊 データ件数: ${allMonths.length}ヶ月分\n`);

  const results = [];

  for (const store of STORES) {
    console.log(`🏪 ${store.name} を処理中...`);

    const current  = extractStoreData(dataMap, latestMonth, store);
    const prev     = extractStoreData(dataMap, prevMonth(latestMonth), store);
    const prevYr   = extractStoreData(dataMap, prevYear(latestMonth), store);

    if (!current) {
      console.warn(`  ⚠️  ${latestMonth} のデータが見つかりません`);
    }

    // 直近6ヶ月の売上推移（グラフ用）
    const history6 = allMonths.slice(-6).map(m => ({
      month: monthLabel(m),
      sales: dataMap[m] ? (parseNum(dataMap[m][store.cols.sales]) ?? 0) : 0,
    }));

    // 客単価 = 売上 ÷ 客数
    const unitPrice = (current?.sales && current?.customers)
      ? Math.round(current.sales / current.customers)
      : null;
    const unitPricePrev = (prev?.sales && prev?.customers)
      ? Math.round(prev.sales / prev.customers)
      : null;

    results.push({
      storeId:   store.id,
      storeName: store.name,
      month:     latestMonth,
      kpi: {
        sales: {
          current:   current?.sales    ?? null,
          prevMonth: prev?.sales       ?? null,
          prevYear:  prevYr?.sales     ?? null,
        },
        customers: {
          current:   current?.customers ?? null,
          prevMonth: prev?.customers    ?? null,
          prevYear:  prevYr?.customers  ?? null,
        },
        unitPrice: {
          current:   unitPrice,
          prevMonth: unitPricePrev,
        },
        laborCostRate:     { current: current?.rate ?? null },
        salesPerHour:      current?.hour ?? null,
        laborProductivity: current?.prod ?? null,
      },
      salesHistory: history6,
    });

    console.log(`  ✅ 売上: ${current?.sales?.toLocaleString() ?? '未入力'} 円`);
    console.log(`  ✅ 客数: ${current?.customers ?? '未入力（手入力待ち）'} 人`);
  }

  const outputDir = path.join(__dirname, '..', 'data');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'store-data.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), latestMonth, stores: results }, null, 2)
  );

  console.log('\n💾 data/store-data.json に保存しました');
}

main().catch(err => { console.error(err); process.exit(1); });
