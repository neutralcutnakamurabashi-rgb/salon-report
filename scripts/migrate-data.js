#!/usr/bin/env node
/**
 * migrate-data.js
 * 既存の「全社」シートから「レポートデータ」シートへ自動移行する（一回限り）
 *
 * 実行方法:
 *   node scripts/migrate-data.js
 *
 * 注意: 客数列（C, H, M列）は手入力が必要（ノート管理のため）
 */

import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? './config/service-account.json';

// 全社シートの行番号（1始まり）
const ROW = {
  SECTION_HEADER: 2,   // 店舗セクションタイトル
  MONTHS:         3,   // 月ヘッダー（2025.8, 2025.9 ...）
  SALES:          4,   // 売上合計
  LABOR_PROD:    22,   // 労働生産性
  SALES_HOUR:    23,   // 時間売上
  LABOR_RATE:    24,   // 人件費率
};

const STORES = [
  { id: 'fujimidai',   keyword: '富士見台', name: '富士見台店' },
  { id: 'nakamurashi', keyword: '中村橋',   name: '中村橋店' },
  { id: 'sakuradai',   keyword: '桜台',     name: '桜台店' },
];

async function getAuthClient() {
  const keyPath = path.resolve(__dirname, '..', SERVICE_ACCOUNT_KEY);
  const key = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// "2025.8" → "2025-08"、"2026.01" → "2026-01"
function normalizeMonth(raw) {
  const str = String(raw ?? '').trim();
  const match = str.match(/^(\d{4})\.(\d{1,2})$/);
  if (!match) return null;
  const month = String(parseInt(match[2])).padStart(2, '0');
  return `${match[1]}-${month}`;
}

// カンマ・%を除いて数値化（空なら空文字）
function parseNum(val) {
  if (val === undefined || val === null || val === '') return '';
  const str = String(val).replace(/,/g, '').replace(/%/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? '' : num;
}

async function main() {
  if (!SPREADSHEET_ID) {
    console.error('❌ SPREADSHEET_ID が設定されていません（.env を確認してください）');
    process.exit(1);
  }

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('📖 全社シートを読み込み中...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '全社!A1:BZ30',  // 十分に広い範囲
  });
  const rawRows = res.data.values ?? [];

  const sectionRow = rawRows[ROW.SECTION_HEADER - 1] ?? [];
  const monthRow   = rawRows[ROW.MONTHS - 1]         ?? [];
  const salesRow   = rawRows[ROW.SALES - 1]          ?? [];
  const prodRow    = rawRows[ROW.LABOR_PROD - 1]     ?? [];
  const hourRow    = rawRows[ROW.SALES_HOUR - 1]     ?? [];
  const rateRow    = rawRows[ROW.LABOR_RATE - 1]     ?? [];

  // 行3（月ヘッダー）にある全月列を収集
  const allMonthCols = [];
  for (let col = 0; col < monthRow.length; col++) {
    const m = normalizeMonth(monthRow[col]);
    if (m) allMonthCols.push({ col, month: m });
  }

  // 各店舗のセクションヘッダー位置を取得
  const storePositions = [];
  for (const store of STORES) {
    const headerCol = sectionRow.findIndex(c => String(c).includes(store.keyword));
    if (headerCol === -1) {
      console.warn(`⚠️  ${store.name} のヘッダーが見つかりません（スキップ）`);
      continue;
    }
    storePositions.push({ store, headerCol });
  }
  storePositions.sort((a, b) => a.headerCol - b.headerCol);

  // 各店舗に対し、そのセクション範囲内の月列を割り当てる
  // ヘッダーの1列前まで含める（ヘッダーが1列ずれていてもデータを取りこぼさない）
  const storeData = {};
  for (let i = 0; i < storePositions.length; i++) {
    const { store, headerCol } = storePositions[i];
    const nextHeaderCol = i + 1 < storePositions.length
      ? storePositions[i + 1].headerCol
      : Infinity;

    const monthCols = allMonthCols.filter(mc =>
      mc.col >= headerCol - 1 && mc.col < nextHeaderCol
    );

    storeData[store.id] = { store, monthCols };
    console.log(`✅ ${store.name}: ${monthCols.length}ヶ月分 (列${headerCol + 1}〜)`);
  }

  // 全ユニーク月をソート
  const allMonths = [...new Set(
    Object.values(storeData).flatMap(d => d.monthCols.map(m => m.month))
  )].sort();

  console.log(`\n📅 移行対象月: ${allMonths.join(', ')}`);

  // 出力行を構築
  const outputRows = [];

  // ヘッダー行（既存のものを上書きしないよう確認用にも使える）
  outputRows.push([
    '年月',
    '富士見台_売上', '富士見台_客数', '富士見台_人件費率', '富士見台_時間売上', '富士見台_労働生産性',
    '中村橋_売上',  '中村橋_客数',  '中村橋_人件費率',  '中村橋_時間売上',  '中村橋_労働生産性',
    '桜台_売上',    '桜台_客数',    '桜台_人件費率',    '桜台_時間売上',    '桜台_労働生産性',
  ]);

  for (const month of allMonths) {
    const row = [month];

    for (const storeId of ['fujimidai', 'nakamurashi', 'sakuradai']) {
      const data = storeData[storeId];
      if (!data) {
        row.push('', '', '', '', '');
        continue;
      }
      const mc = data.monthCols.find(m => m.month === month);
      if (!mc) {
        row.push('', '', '', '', '');
        continue;
      }
      row.push(
        parseNum(salesRow[mc.col]),
        '',                           // 客数：手入力
        parseNum(rateRow[mc.col]),
        parseNum(hourRow[mc.col]),
        parseNum(prodRow[mc.col]),
      );
    }

    outputRows.push(row);
  }

  // レポートデータシートに書き込み
  console.log('\n✍️  レポートデータシートに書き込み中...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'レポートデータ!A1',
    valueInputOption: 'RAW',
    requestBody: { values: outputRows },
  });

  console.log(`\n✅ 完了！ ${allMonths.length}ヶ月分を移行しました`);
  console.log('');
  console.log('📝 次のステップ：');
  console.log('   スプレッドシートの「レポートデータ」シートを開き、');
  console.log('   C列（富士見台_客数）、H列（中村橋_客数）、M列（桜台_客数）に');
  console.log('   各月の客数をノートから手入力してください。');
}

main().catch(err => { console.error(err); process.exit(1); });
