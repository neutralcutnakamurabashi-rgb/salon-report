#!/usr/bin/env node
/**
 * generate-manager-email.js
 * manager-report.json をもとにHTMLメールを生成する
 * Claude APIで相談テキストを整文する
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fmt(num, isRate = false) {
  if (num === null || num === undefined) return '—';
  if (isRate) return `${num.toFixed(2)}%`;
  return `¥${Math.round(num).toLocaleString()}`;
}

function diff(current, prev) {
  if (current === null || prev === null || prev === 0) return '';
  const d = current - prev;
  const sign = d >= 0 ? '+' : '';
  return `<span style="font-size:11px;color:${d >= 0 ? '#059669' : '#dc2626'}">${sign}¥${Math.round(d).toLocaleString()}</span>`;
}

function monthLabel(m) {
  const [y, mo] = m.split('-');
  return `${y}年${parseInt(mo)}月`;
}

async function summarizeComment(rawText) {
  if (!rawText || rawText.trim().length < 10) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  ANTHROPIC_API_KEY未設定 - コメント整文をスキップ');
    return rawText;
  }

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `以下は美容室オーナーが音声入力した、前職の上司（大西店長）への月次報告の下書きです。
敬語で、読みやすく整文してください。元の内容・意図はそのまま残し、300〜400字程度にまとめてください。
段落は適切に分けてください。

【音声テキスト】
${rawText}`,
    }],
  });

  return msg.content[0].type === 'text' ? msg.content[0].text : rawText;
}

async function main() {
  const dataPath = path.join(__dirname, '..', 'data', 'manager-report.json');
  const data = JSON.parse(await fs.readFile(dataPath, 'utf-8'));

  console.log('✍️  AIでコメントを整文中...');
  const polishedComment = await summarizeComment(data.commentText);

  const latest = data.latest;
  const prev   = data.prev;
  const isDataReady = data.latestDataReady;
  const latestLabel = monthLabel(data.latestMonth);

  // 直近6ヶ月グラフ用データ
  const chartMonths = data.financials.map(f => monthLabel(f.month));
  const chartSales  = data.financials.map(f => f.sales ?? 0);
  const maxSales    = Math.max(...chartSales) || 1;

  const barHTML = data.financials.map((f, i) => {
    const h = Math.round((f.sales ?? 0) / maxSales * 80);
    const isLatest = i === data.financials.length - 1;
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
        <div style="font-size:9px;color:#64748b">${f.sales ? '¥' + Math.round(f.sales / 10000) + '万' : '—'}</div>
        <div style="width:100%;background:${isLatest ? '#0f172a' : '#cbd5e1'};height:${h}px;border-radius:3px 3px 0 0;min-height:4px"></div>
        <div style="font-size:9px;color:#64748b">${monthLabel(f.month).replace('年', '/').replace('月', '')}</div>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>月次レポート ${latestLabel} — Neutral</title>
</head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:'Hiragino Sans','Noto Sans JP',sans-serif">
<div style="max-width:600px;margin:0 auto">

  <!-- ヘッダー -->
  <div style="background:#0f172a;border-radius:12px 12px 0 0;padding:28px 28px 20px">
    <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Monthly Report</p>
    <h1 style="margin:0 0 4px;color:#fff;font-size:22px;font-weight:900">カット専門店 Neutral</h1>
    <p style="margin:0;color:#94a3b8;font-size:13px">${latestLabel}度 月次報告 — 大西店長へ</p>
  </div>

  <!-- 財務サマリー -->
  <div style="background:#fff;padding:24px 28px;border-left:4px solid #0f172a">
    <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#64748b;letter-spacing:1px">
      ${isDataReady ? '📊 FINANCIAL SUMMARY' : '⚠️ FINANCIAL SUMMARY — データ未確定（確定後に別途お送りします）'}
    </p>
    ${isDataReady ? `
    <table style="width:100%;border-collapse:collapse">
      <tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:10px 0;font-size:13px;color:#475569;width:40%">売上合計</td>
        <td style="padding:10px 0;font-size:16px;font-weight:900;color:#0f172a">${fmt(latest?.sales)}</td>
        <td style="padding:10px 0;font-size:12px;text-align:right">${diff(latest?.sales, prev?.sales)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:10px 0;font-size:13px;color:#475569">粗利</td>
        <td style="padding:10px 0;font-size:16px;font-weight:900;color:#0f172a">${fmt(latest?.grossProfit)}</td>
        <td style="padding:10px 0;font-size:12px;text-align:right">${diff(latest?.grossProfit, prev?.grossProfit)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:10px 0;font-size:13px;color:#475569">人件費</td>
        <td style="padding:10px 0;font-size:16px;font-weight:900;color:#0f172a">${fmt(latest?.laborCost)}</td>
        <td style="padding:10px 0;font-size:12px;text-align:right">${diff(latest?.laborCost, prev?.laborCost)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:10px 0;font-size:13px;color:#475569">固定費合計</td>
        <td style="padding:10px 0;font-size:16px;font-weight:900;color:#0f172a">${fmt(latest?.fixedCost)}</td>
        <td style="padding:10px 0;font-size:12px;text-align:right">${diff(latest?.fixedCost, prev?.fixedCost)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:13px;color:#475569">営業利益</td>
        <td style="padding:10px 0;font-size:18px;font-weight:900;color:${(latest?.operatingProfit ?? 0) >= 0 ? '#059669' : '#dc2626'}">${fmt(latest?.operatingProfit)}</td>
        <td style="padding:10px 0;font-size:12px;text-align:right">${diff(latest?.operatingProfit, prev?.operatingProfit)}</td>
      </tr>
    </table>
    ` : `
    <p style="margin:0;color:#94a3b8;font-size:13px">先月分の数値は現在集計中です。確定次第、改めてお送りします。</p>
    `}
  </div>

  <!-- 売上推移グラフ -->
  ${isDataReady ? `
  <div style="background:#f8fafc;padding:20px 28px;border-left:4px solid #0f172a">
    <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#64748b;letter-spacing:1px">📈 売上推移（直近6ヶ月）</p>
    <div style="display:flex;align-items:flex-end;gap:8px;height:100px;padding:0 4px">
      ${barHTML}
    </div>
  </div>
  ` : ''}

  <!-- 相談・近況 -->
  <div style="background:#fff;padding:24px 28px;border-left:4px solid #b5624a">
    <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#b5624a;letter-spacing:1px">💬 今月のご報告・ご相談</p>
    ${polishedComment
      ? polishedComment.split('\n').filter(l => l.trim()).map(l =>
          `<p style="margin:0 0 12px;font-size:14px;line-height:1.8;color:#334155">${l}</p>`
        ).join('')
      : '<p style="margin:0;color:#94a3b8;font-size:13px">（今月のコメントはありません）</p>'
    }
  </div>

  <!-- フッター -->
  <div style="background:#0f172a;border-radius:0 0 12px 12px;padding:16px 28px">
    <p style="margin:0;color:#475569;font-size:11px">カット専門店 Neutral — 月次報告</p>
  </div>

</div>
</body>
</html>`;

  const outputDir = path.join(__dirname, '..', 'output');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'manager-email.html'), html);

  console.log('✅ output/manager-email.html を生成しました');
}

main().catch(err => { console.error(err); process.exit(1); });
