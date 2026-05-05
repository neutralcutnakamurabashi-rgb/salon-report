#!/usr/bin/env node
/**
 * fetch-manager-report.js
 * 「全社」シートから直近6ヶ月の財務データと
 * 「月次コメント」シートから今月の相談・報告テキストを取得する
 */

import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? './config/service-account.json';

// 全社シートの行インデックス（0始まり、行27=インデックス26）
const ROW = {
  MONTH_HEADER:   26, // 行27：月ヘッダー（2025.8, 2025.9...）
  SALES:          27, // 行28：売上合計
  GROSS_PROFIT:   33, // 行34：粗利
  LABOR_COST:     34, // 行35：人件費
  FIXED_COST:     45, // 行46：固定費合計
  OPERATING_PROFIT: 46, // 行47：営業利益
  LABOR_RATE:     55, // 行56：人件費率
};

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
  const str = String(val).replace(/,/g, '').replace(/%/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// "2025.8" / "2025.10" / "2026-04" → "2025-08" などに正規化
function normalizeMonth(str) {
  if (!str) return null;
  const normalized = String(str).trim().replace('.', '-');
  const parts = normalized.split('-');
  if (parts.length !== 2) return null;
  return `${parts[0]}-${parts[1].padStart(2, '0')}`;
}

async function main() {
  if (!SPREADSHEET_ID) {
    console.error('❌ SPREADSHEET_ID が未設定です');
    process.exit(1);
  }

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // ① 全社シートを取得（行27〜57、列A〜K）
  console.log('📖 全社シートを読み込み中...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '全社!A27:K57',
  });
  const rows = res.data.values ?? [];

  if (rows.length === 0) {
    console.error('❌ 全社シートのデータが取得できませんでした');
    process.exit(1);
  }

  // 月ヘッダー行からカラムマップを作成
  const headerRow = rows[ROW.MONTH_HEADER - 26]; // インデックス調整
  const monthColMap = {}; // "2025-08" → colIndex
  headerRow.forEach((cell, i) => {
    if (i === 0) return; // 列A（ラベル列）はスキップ
    const m = normalizeMonth(cell);
    if (m) monthColMap[m] = i;
  });

  const allMonths = Object.keys(monthColMap).sort();
  const recentMonths = allMonths.slice(-6); // 直近6ヶ月
  const latestMonth = recentMonths[recentMonths.length - 1];

  console.log(`📅 最新月: ${latestMonth}`);
  console.log(`📊 取得月: ${recentMonths.join(', ')}\n`);

  // 各月のデータを抽出
  const financials = recentMonths.map(month => {
    const col = monthColMap[month];
    const getVal = (rowOffset) => parseNum(rows[rowOffset]?.[col]);
    const isDataReady = getVal(ROW.SALES - 26) !== null && getVal(ROW.SALES - 26) !== 0;
    return {
      month,
      isDataReady,
      sales:           getVal(ROW.SALES - 26),
      grossProfit:     getVal(ROW.GROSS_PROFIT - 26),
      laborCost:       getVal(ROW.LABOR_COST - 26),
      fixedCost:       getVal(ROW.FIXED_COST - 26),
      operatingProfit: getVal(ROW.OPERATING_PROFIT - 26),
      laborRate:       getVal(ROW.LABOR_RATE - 26),
    };
  });

  const latestData = financials[financials.length - 1];
  const prevData   = financials[financials.length - 2] ?? null;

  // ② 月次コメントシートを取得
  console.log('📖 月次コメントシートを読み込み中...');
  let commentText = '';
  let sendDate = '';
  try {
    const commentRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '月次コメント!B1:B2',
    });
    const commentVals = commentRes.data.values ?? [];
    sendDate    = commentVals[0]?.[0] ?? '';
    commentText = commentVals[1]?.[0] ?? '';
    console.log(`✅ コメント取得: ${commentText.length}文字`);
  } catch (e) {
    console.warn('⚠️  月次コメントシートが見つかりません（後で追加してください）');
  }

  // 保存
  const output = {
    fetchedAt: new Date().toISOString(),
    latestMonth,
    latestDataReady: latestData?.isDataReady ?? false,
    sendDate,
    commentText,
    financials,
    latest: latestData,
    prev: prevData,
  };

  const outputDir = path.join(__dirname, '..', 'data');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'manager-report.json'),
    JSON.stringify(output, null, 2)
  );

  console.log('\n💾 data/manager-report.json に保存しました');
  console.log(`📊 最新月データ準備: ${latestData?.isDataReady ? '✅ 完了' : '⚠️  未確定'}`);
}

main().catch(err => { console.error(err); process.exit(1); });
