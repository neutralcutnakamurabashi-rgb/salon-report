#!/usr/bin/env node
/**
 * generate-ai-comment.js
 * Anthropic Claude APIを使って3店舗分のAIコメントを生成する
 *
 * 出力: data/ai-comments.json
 * {
 *   "sakuradai":    { trend, points: [...], nextMonth },
 *   "fujimidai":   { ... },
 *   "nakamurashi": { ... }
 * }
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildPrompt(store) {
  const { storeName, month, kpi, ageGender } = store;
  const totalMale   = Object.values(ageGender.male).reduce((a, b) => a + b, 0);
  const totalFemale = Object.values(ageGender.female).reduce((a, b) => a + b, 0);

  return `あなたはカット専門店のアルバイトスタッフ向けに月次レポートのコメントを書くアシスタントです。
専門用語を使わず、高校生のアルバイトでも理解できる言葉で書いてください。

## ${storeName} ${month} のデータ

### 売上
- 今月: ¥${kpi.sales.current.toLocaleString()}
- 前月: ¥${kpi.sales.prevMonth.toLocaleString()}（${kpi.sales.current > kpi.sales.prevMonth ? '増加' : '減少'}）
- 前年同月: ¥${kpi.sales.prevYear.toLocaleString()}（${kpi.sales.current > kpi.sales.prevYear ? '増加' : '減少'}）

### 客数
- 今月: ${kpi.customers.current}名
- 前月比: ${kpi.customers.current - kpi.customers.prevMonth > 0 ? '+' : ''}${kpi.customers.current - kpi.customers.prevMonth}名
- 前年同月比: ${kpi.customers.current - kpi.customers.prevYear > 0 ? '+' : ''}${kpi.customers.current - kpi.customers.prevYear}名

### 客単価
- 今月: ¥${kpi.unitPrice.current.toLocaleString()}
- 前月比: ${kpi.unitPrice.current - kpi.unitPrice.prevMonth > 0 ? '+' : ''}¥${Math.abs(kpi.unitPrice.current - kpi.unitPrice.prevMonth).toLocaleString()}

### 人件費比率
- ${kpi.laborCostRate.current}%（業界目安: 38%）
- 状態: ${kpi.laborCostRate.current < 35 ? '良好（目安を大きく下回る）' : kpi.laborCostRate.current <= 40 ? '普通（目安前後）' : '要注意（目安を超過）'}

### シフト効率
- 時間売上（営業1時間あたりの売上）: ¥${kpi.salesPerHour.toLocaleString()}
- 労働生産性（スタッフ1時間あたりの売上）: ¥${kpi.laborProductivity.toLocaleString()}
- 差（無駄シフトの量）: ¥${(kpi.salesPerHour - kpi.laborProductivity).toLocaleString()}/時間

### 客層（性別）
- 男性: ${totalMale}名、女性: ${totalFemale}名

## 出力形式（必ずこのJSONのみを返してください）

\`\`\`json
{
  "trend": "今月の全体的な傾向を2〜3文で。数字を具体的に使うこと。",
  "points": [
    "注目ポイント1（改善が必要な点や課題）",
    "注目ポイント2（改善が必要な点や課題）",
    "注目ポイント3（良かった点や前向きな内容）"
  ],
  "nextMonth": "来月に向けたアドバイスを1〜2文で。具体的な目標数値を含めること。"
}
\`\`\``;
}

async function generateComment(store) {
  console.log(`🤖 ${store.storeName} のAIコメントを生成中...`);

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(store) }],
  });

  const text = message.content[0].text;

  // JSONブロックを抽出
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) {
    throw new Error(`JSONが見つかりません: ${text}`);
  }

  const parsed = JSON.parse(match[1]);
  console.log(`  ✅ 生成完了`);
  return parsed;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY が設定されていません');
    process.exit(1);
  }

  const { stores } = JSON.parse(
    await fs.readFile(path.join(__dirname, '..', 'data', 'store-data.json'), 'utf-8')
  );

  const comments = {};
  for (const store of stores) {
    comments[store.storeId] = await generateComment(store);
  }

  await fs.writeFile(
    path.join(__dirname, '..', 'data', 'ai-comments.json'),
    JSON.stringify(comments, null, 2)
  );

  console.log('\n💾 data/ai-comments.json に保存しました');
}

main().catch(err => { console.error(err); process.exit(1); });
