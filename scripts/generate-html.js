#!/usr/bin/env node
/**
 * generate-html.js
 * store-data.json を読み込んで3店舗分のHTMLレポートを生成する
 *
 * 出力:
 *   output/report-sakuradai.html
 *   output/report-fujimidai.html
 *   output/report-nakamurashi.html
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadStoreData() {
  const dataPath = path.join(__dirname, '..', 'data', 'store-data.json');
  const raw = await fs.readFile(dataPath, 'utf-8');
  return JSON.parse(raw);
}

async function loadAiComments() {
  try {
    const dataPath = path.join(__dirname, '..', 'data', 'ai-comments.json');
    const raw = await fs.readFile(dataPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};  // AIコメントが未生成の場合は空
  }
}

/**
 * 人件費比率に応じたカラーテーマを返す
 * 35%未満 → 緑（良好）/ 35〜40% → 黄（普通）/ 40%超 → 赤（要注意）
 */
function getLaborCostTheme(rate) {
  if (rate < 35) return { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', badge: '良好', bar: 'bg-emerald-500' };
  if (rate <= 40) return { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700', badge: '普通', bar: 'bg-amber-400' };
  return { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-600', badge: '要注意', bar: 'bg-red-400' };
}

function formatDiff(value, isPercent = false) {
  if (value === 0) return { text: '±0', color: 'text-slate-400' };
  const prefix = value > 0 ? '▲ +' : '▼ ';
  const suffix = isPercent ? '%' : '';
  const color = value > 0 ? 'text-emerald-500' : 'text-red-400';
  return { text: `${prefix}${Math.abs(value)}${suffix}`, color };
}

function generateHtml(store, aiComment) {
  const { kpi, salesHistory, ageGender, storeName, month } = store;
  const laborTheme = getLaborCostTheme(kpi.laborCostRate.current);
  const industryAvgRate = 38;
  const laborBarWidth = Math.min((kpi.laborCostRate.current / 50) * 100, 100).toFixed(1);
  const industryMarkerLeft = ((industryAvgRate / 50) * 100).toFixed(1);
  const shiftDiff = kpi.salesPerHour - kpi.laborProductivity;

  const salesDiffMonth = formatDiff(
    ((kpi.sales.current - kpi.sales.prevMonth) / kpi.sales.prevMonth * 100).toFixed(1) * 1,
    true
  );
  const salesDiffYear = formatDiff(
    ((kpi.sales.current - kpi.sales.prevYear) / kpi.sales.prevYear * 100).toFixed(1) * 1,
    true
  );
  const customerDiffMonth = formatDiff(kpi.customers.current - kpi.customers.prevMonth);
  const customerDiffYear  = formatDiff(kpi.customers.current - kpi.customers.prevYear);
  const unitPriceDiff     = formatDiff(kpi.unitPrice.current - kpi.unitPrice.prevMonth);

  const salesChartData = JSON.stringify(salesHistory.map(h => h.sales));
  const salesChartLabels = JSON.stringify(salesHistory.map(h => h.month));

  const maleData   = JSON.stringify(Object.values(ageGender.male));
  const femaleData = JSON.stringify(Object.values(ageGender.female).map(v => -v));
  const totalMale   = Object.values(ageGender.male).reduce((a, b) => a + b, 0);
  const totalFemale = Object.values(ageGender.female).reduce((a, b) => a + b, 0);
  const total       = totalMale + totalFemale;
  const maleRate    = total > 0 ? Math.round(totalMale / total * 100) : 0;
  const femaleRate  = 100 - maleRate;

  const comment = aiComment ?? {
    trend: 'データを取得中です。',
    points: ['—', '—', '—'],
    nextMonth: '—',
  };

  const pyramidMax = Math.max(
    ...Object.values(ageGender.male),
    ...Object.values(ageGender.female),
    1
  );
  const pyramidAxisMax = Math.ceil(pyramidMax * 1.3);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${storeName} 月次レポート — ${month}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
    tailwind.config = {
      theme: { extend: { fontFamily: { sans: ['"Noto Sans JP"', '"Hiragino Sans"', 'sans-serif'] } } }
    }
  </script>
  <style>
    body { font-family: "Noto Sans JP", "Hiragino Sans", sans-serif; }
    #reportCard { width: 390px; }
  </style>
</head>
<body class="bg-slate-300 py-8 px-4 flex flex-col items-center">

  <div id="reportCard" class="bg-white shadow-2xl overflow-hidden rounded-xl">

    <!-- ▌HEADER -->
    <div class="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-5 pt-6 pb-5">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-bold tracking-widest text-teal-300 uppercase">Monthly Report</span>
        <span class="bg-teal-400/20 text-teal-200 text-xs font-bold px-3 py-1 rounded-full border border-teal-400/30">
          ${month}
        </span>
      </div>
      <h1 class="text-white text-3xl font-black tracking-tight">${storeName}</h1>
    </div>

    <!-- ▌KPI CARDS -->
    <div class="px-4 pt-4 space-y-2.5">

      <div class="grid grid-cols-2 gap-2.5">
        <div class="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
          <p class="text-xs text-slate-400 font-medium mb-1.5">売上合計</p>
          <p class="text-xl font-black text-slate-800 leading-none">¥${kpi.sales.current.toLocaleString()}</p>
          <div class="mt-2 space-y-0.5">
            <div class="flex items-center gap-1">
              <span class="${salesDiffMonth.color} text-xs font-bold">${salesDiffMonth.text}</span>
              <span class="text-slate-400 text-xs">前月比</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="${salesDiffYear.color} text-xs font-bold">${salesDiffYear.text}</span>
              <span class="text-slate-400 text-xs">前年同月比</span>
            </div>
          </div>
        </div>
        <div class="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
          <p class="text-xs text-slate-400 font-medium mb-1.5">客数</p>
          <p class="text-xl font-black text-slate-800 leading-none">${kpi.customers.current} <span class="text-sm font-bold text-slate-400">名</span></p>
          <div class="mt-2 space-y-0.5">
            <div class="flex items-center gap-1">
              <span class="${customerDiffMonth.color} text-xs font-bold">${customerDiffMonth.text}名</span>
              <span class="text-slate-400 text-xs">前月比</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="${customerDiffYear.color} text-xs font-bold">${customerDiffYear.text}名</span>
              <span class="text-slate-400 text-xs">前年同月比</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2.5">
        <div class="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
          <p class="text-xs text-slate-400 font-medium mb-1.5">客単価</p>
          <p class="text-xl font-black text-slate-800 leading-none">¥${kpi.unitPrice.current.toLocaleString()}</p>
          <div class="mt-2">
            <div class="flex items-center gap-1">
              <span class="${unitPriceDiff.color} text-xs font-bold">${unitPriceDiff.text}</span>
              <span class="text-slate-400 text-xs">前月比</span>
            </div>
          </div>
        </div>
        <div class="${laborTheme.bg} rounded-2xl p-3.5 border ${laborTheme.border}">
          <p class="text-xs ${laborTheme.text} font-medium mb-1.5">人件費比率</p>
          <div class="flex items-baseline gap-1.5">
            <p class="text-xl font-black ${laborTheme.text} leading-none">${kpi.laborCostRate.current}%</p>
            <span class="text-xs font-bold ${laborTheme.text}">${laborTheme.badge}</span>
          </div>
          <div class="mt-2">
            <div class="relative w-full bg-slate-200 rounded-full h-2">
              <div class="${laborTheme.bar} h-2 rounded-full" style="width:${laborBarWidth}%"></div>
              <div class="absolute top-0 h-2 w-0.5 bg-amber-500" style="left:${industryMarkerLeft}%"></div>
            </div>
            <div class="flex justify-between text-xs mt-1">
              <span class="${laborTheme.text} font-bold">${kpi.laborCostRate.current}%</span>
              <span class="text-amber-600 text-xs">目安 ${industryAvgRate}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- シフト効率診断 -->
      <div class="bg-slate-800 rounded-2xl p-4">
        <p class="text-xs font-bold text-slate-300 mb-0.5">シフト効率診断</p>
        <p class="text-xs text-slate-500 mb-3">差が大きいほど、無駄なシフトが発生しています</p>
        <div class="grid grid-cols-3 items-center gap-1 text-center">
          <div>
            <p class="text-xs text-blue-300 mb-1">時間売上</p>
            <p class="text-lg font-black text-white leading-none">¥${kpi.salesPerHour.toLocaleString()}</p>
            <p class="text-xs text-slate-500 mt-0.5">/時間</p>
            <p class="text-xs text-slate-600 mt-1.5">営業1時間あたりの稼ぎ</p>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="${shiftDiff > 800 ? 'bg-red-500/20 border-red-500/30' : 'bg-amber-500/20 border-amber-500/30'} border rounded-xl px-3 py-1.5">
              <p class="text-xs ${shiftDiff > 800 ? 'text-red-400' : 'text-amber-400'}">差</p>
              <p class="text-base font-black ${shiftDiff > 800 ? 'text-red-300' : 'text-amber-300'}">¥${shiftDiff.toLocaleString()}</p>
            </div>
            <p class="text-xs text-slate-600">損失/時間</p>
          </div>
          <div>
            <p class="text-xs text-teal-300 mb-1">労働生産性</p>
            <p class="text-lg font-black text-white leading-none">¥${kpi.laborProductivity.toLocaleString()}</p>
            <p class="text-xs text-slate-500 mt-0.5">/時間</p>
            <p class="text-xs text-slate-600 mt-1.5">スタッフ1時間あたりの稼ぎ</p>
          </div>
        </div>
      </div>

    </div>

    <!-- ▌売上推移グラフ -->
    <div class="px-4 pt-4">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-xs font-bold text-slate-700">売上推移（直近6ヶ月）</h2>
        <span class="text-xs text-slate-400">単位：万円</span>
      </div>
      <div class="bg-slate-50 rounded-2xl border border-slate-100 p-3" style="height:160px; position:relative;">
        <canvas id="salesChart"></canvas>
      </div>
    </div>

    <!-- ▌人口ピラミッド -->
    <div class="px-4 pt-4">
      <h2 class="text-xs font-bold text-slate-700 mb-2">客層分布（年代 × 性別）</h2>
      <div class="bg-slate-50 rounded-2xl border border-slate-100 p-3" style="height:210px; position:relative;">
        <canvas id="pyramidChart"></canvas>
      </div>
      <div class="flex justify-center gap-5 mt-2">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-2.5 rounded bg-blue-400 inline-block"></span>
          <span class="text-xs text-slate-500">男性 ${totalMale}名（${maleRate}%）</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-2.5 rounded bg-pink-400 inline-block"></span>
          <span class="text-xs text-slate-500">女性 ${totalFemale}名（${femaleRate}%）</span>
        </div>
      </div>
    </div>

    <!-- ▌AIコメント -->
    <div class="px-4 pt-4 pb-5">
      <div class="bg-amber-50 rounded-2xl p-4 border border-amber-200">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
            <span class="text-white text-xs font-black">AI</span>
          </div>
          <h2 class="text-sm font-bold text-amber-800">今月のコメント</h2>
        </div>
        <div class="mb-3">
          <p class="text-xs font-bold text-amber-700 mb-1">今月の傾向</p>
          <p class="text-xs text-amber-900 leading-relaxed">${comment.trend}</p>
        </div>
        <div class="mb-3 bg-amber-100/70 rounded-xl p-3">
          <p class="text-xs font-bold text-amber-700 mb-2">注目ポイント</p>
          <ul class="text-xs text-amber-900 space-y-2">
            ${comment.points.map(p => `<li class="flex gap-1.5"><span class="text-amber-500 flex-shrink-0 mt-0.5">▶</span><span>${p}</span></li>`).join('\n            ')}
          </ul>
        </div>
        <div>
          <p class="text-xs font-bold text-amber-700 mb-1">来月に向けて</p>
          <p class="text-xs text-amber-900 leading-relaxed">${comment.nextMonth}</p>
        </div>
      </div>
    </div>

    <!-- ▌FOOTER -->
    <div class="bg-slate-900 px-5 py-3 flex items-center justify-between">
      <p class="text-xs text-slate-500">${storeName} 月次レポート</p>
      <p class="text-xs text-slate-500">${month} / 自動生成</p>
    </div>

  </div>

  <script>
    Chart.defaults.font.family = '"Noto Sans JP", sans-serif';
    Chart.defaults.animation = false;

    new Chart(document.getElementById('salesChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: ${salesChartLabels},
        datasets: [{
          data: ${salesChartData},
          backgroundColor: [
            'rgba(15,118,110,0.20)', 'rgba(15,118,110,0.28)', 'rgba(15,118,110,0.38)',
            'rgba(15,118,110,0.58)', 'rgba(15,118,110,0.72)', 'rgba(15,118,110,0.90)',
          ],
          borderRadius: 5,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => '¥' + (ctx.parsed.y * 10000).toLocaleString() } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94A3B8' } },
          y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 }, color: '#94A3B8', callback: v => v + '万' } }
        }
      }
    });

    new Chart(document.getElementById('pyramidChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['10代', '20代', '30代', '40代', '50代', '60代+'],
        datasets: [
          { label: '女性', data: ${femaleData}, backgroundColor: 'rgba(244,114,182,0.75)', borderColor: 'rgba(244,114,182,1)', borderWidth: 1, borderRadius: 3 },
          { label: '男性', data: ${maleData},   backgroundColor: 'rgba(96,165,250,0.75)',  borderColor: 'rgba(96,165,250,1)',  borderWidth: 1, borderRadius: 3 }
        ]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + Math.abs(ctx.parsed.x) + '名' } }
        },
        scales: {
          x: { min: -${pyramidAxisMax}, max: ${pyramidAxisMax}, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 }, color: '#94A3B8', callback: v => Math.abs(v) } },
          y: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748B' } }
        }
      }
    });

    window.__chartsReady = true;
  </script>

</body>
</html>`;
}

async function main() {
  const { stores } = await loadStoreData();
  const aiComments = await loadAiComments();

  const outputDir = path.join(__dirname, '..', 'output');
  await fs.mkdir(outputDir, { recursive: true });

  for (const store of stores) {
    const comment = aiComments[store.storeId];
    const html = generateHtml(store, comment);
    const filename = `report-${store.storeId}.html`;
    await fs.writeFile(path.join(outputDir, filename), html);
    console.log(`✅ output/${filename} を生成しました`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
