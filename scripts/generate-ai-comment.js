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

function laborStatus(rate) {
  if (rate > 55) return '要注意（目標の55%を超過）';
  if (rate > 45) return '適正（45〜55%の範囲内）';
  return '良好（目標の45%を下回る）';
}

function buildPrompt(store) {
  const { storeName, month, kpi } = store;

  const salesPrevMonthLine = kpi.sales.prevMonth !== null
    ? `- 前月: ¥${kpi.sales.prevMonth.toLocaleString()}（${kpi.sales.current > kpi.sales.prevMonth ? '▲増加' : '▼減少'}）`
    : '';
  const salesPrevYearLine = kpi.sales.prevYear !== null
    ? `- 前年同月: ¥${kpi.sales.prevYear.toLocaleString()}（${kpi.sales.current > kpi.sales.prevYear ? '▲増加' : '▼減少'}）`
    : '';

  const custPrevMonthLine = kpi.customers.prevMonth !== null
    ? `- 前月比: ${kpi.customers.current - kpi.customers.prevMonth > 0 ? '+' : ''}${kpi.customers.current - kpi.customers.prevMonth}名`
    : '';
  const custPrevYearLine = kpi.customers.prevYear !== null
    ? `- 前年同月比: ${kpi.customers.current - kpi.customers.prevYear > 0 ? '+' : ''}${kpi.customers.current - kpi.customers.prevYear}名`
    : '';

  return `あなたはカット専門店のアルバイトスタッフ向けに月次レポートのコメントを書くアシスタントです。
専門用語を使わず、高校生のアルバイトでも理解できる言葉で書いてください。
【重要】カット専門店のため客単価はほぼ一定です。客単価には言及しないでください。
${store.storeId === 'sakuradai' ? `
【重要】この店舗は基本的に1人シフトで運営しています。シフトの調整・人員配置・無駄なシフトに関するアドバイスは絶対に書かないでください。1人で店舗を回しているという現実を前提にコメントしてください。
` : ''}
## ${storeName} ${month} のデータ

### 売上
- 今月: ¥${kpi.sales.current.toLocaleString()}
${salesPrevMonthLine}
${salesPrevYearLine}

### 客数
- 今月: ${kpi.customers.current}名
${custPrevMonthLine}
${custPrevYearLine}

### 人件費比率
- ${kpi.laborCostRate.current}%（目標ライン: 50%）
- 状態: ${laborStatus(kpi.laborCostRate.current)}

### シフト効率
${store.storeId === 'sakuradai' ? `- 1人シフト店舗のため、シフト効率の指標は参考値
- 時間売上: ¥${kpi.salesPerHour.toLocaleString()}/時間` : `- 時間売上（営業1時間あたりの売上）: ¥${kpi.salesPerHour.toLocaleString()}
- 労働生産性（スタッフ1時間あたりの売上）: ¥${kpi.laborProductivity.toLocaleString()}
- 差（シフトの余裕）: ¥${(kpi.salesPerHour - kpi.laborProductivity).toLocaleString()}/時間`}

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
