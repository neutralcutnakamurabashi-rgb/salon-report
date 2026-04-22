#!/usr/bin/env node
/**
 * generate-html.js
 * store-data.json と ai-comments.json から3店舗分のHTMLレポートを生成する
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir    = path.join(__dirname, '..', 'data');
const outputDir  = path.join(__dirname, '..', 'output');

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('ja-JP');
}

function pct(n) {
  if (n === null || n === undefined) return '—';
  return n.toFixed(2) + '%';
}

function diff(current, prev, isPercent = false) {
  if (current === null || prev === null) return null;
  return isPercent ? current - prev : current - prev;
}

function arrowHtml(delta, higherIsBetter = true) {
  if (delta === null) return '<span class="text-slate-400 text-xs">データなし</span>';
  const positive = delta > 0;
  const good = higherIsBetter ? positive : !positive;
  const color  = delta === 0 ? 'text-slate-400' : (good ? 'text-emerald-500' : 'text-red-400');
  const arrow  = delta === 0 ? '−' : (positive ? '▲ +' : '▼ ');
  const val    = Math.abs(delta);
  return `<span class="${color} text-xs font-bold">${arrow}${fmt(val)}</span>`;
}

function arrowPctHtml(delta, higherIsBetter = true) {
  if (delta === null) return '<span class="text-slate-400 text-xs">データなし</span>';
  const positive = delta > 0;
  const good = higherIsBetter ? positive : !positive;
  const color  = delta === 0 ? 'text-slate-400' : (good ? 'text-emerald-500' : 'text-red-400');
  const arrow  = delta === 0 ? '−' : (positive ? '▲ +' : '▼ ');
  const val    = Math.abs(delta).toFixed(1);
  return `<span class="${color} text-xs font-bold">${arrow}${val}%</span>`;
}

// 人件費率のゾーン設定（30〜80%の範囲で表示）
const LABOR_BAR_MIN = 30;
const LABOR_BAR_MAX = 80;
const LABOR_TARGET  = 50; // 目標ライン

// 人件費率の表示テーマ
function laborTheme(rate) {
  if (rate === null) return { bg: 'bg-slate-50', border: 'border-slate-100', text: 'text-slate-800', label: '', labelColor: 'text-slate-400' };
  if (rate > 55) return { bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-600',    label: '要注意', labelColor: 'text-red-400' };
  if (rate > 45) return { bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-600',  label: '適正',   labelColor: 'text-amber-500' };
  return             { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', label: '良好',   labelColor: 'text-emerald-600' };
}

// バー上の位置（%）を計算
function laborBarPos(value) {
  const clamped = Math.min(Math.max(value, LABOR_BAR_MIN), LABOR_BAR_MAX);
  return ((clamped - LABOR_BAR_MIN) / (LABOR_BAR_MAX - LABOR_BAR_MIN) * 100).toFixed(1);
}

// 売上推移グラフ用データ
function chartData(history) {
  const labels = JSON.stringify(history.map(h => h.month));
  const values = JSON.stringify(history.map(h => +(h.sales / 10000).toFixed(1)));
  const maxVal = Math.max(...history.map(h => h.sales));
  const colors = history.map(h =>
    h.sales === maxVal
      ? 'rgba(20,184,166,0.85)'
      : 'rgba(15,118,110,0.30)'
  );
  return { labels, values, colors: JSON.stringify(colors) };
}

function monthLabel(yyyymm) {
  const [y, m] = yyyymm.split('-');
  return `${y}年${parseInt(m)}月度`;
}

function periodLabel(yyyymm) {
  const [y, m] = yyyymm.split('-');
  const mo = parseInt(m);
  const days = new Date(parseInt(y), mo, 0).getDate();
  return `集計期間：${y}年${mo}月1日〜${days}日`;
}

function pyramidSection(demo) {
  if (!demo) return '';

  const malePct   = demo.total > 0 ? Math.round(demo.maleTotal   / demo.total * 100) : 0;
  const femalePct = demo.total > 0 ? Math.round(demo.femaleTotal / demo.total * 100) : 0;
  const maxVal    = Math.max(...demo.ageGroups.map(g => Math.max(g.male, g.female)));
  const axisMax   = Math.ceil(maxVal * 1.15 / 10) * 10;

  const topMale   = [...demo.ageGroups].sort((a, b) => b.male   - a.male)[0];
  const topFemale = [...demo.ageGroups].sort((a, b) => b.female - a.female)[0];

  return `
    <!-- 客層分析 -->
    <div class="px-4 pt-4">
      <h2 class="text-xs font-bold text-slate-700 mb-2">客層分析（${demo.month.replace('-', '年').replace(/^(\d+年)0?(\d+)$/, '$1$2月')}）</h2>

      <!-- 男女比サマリー -->
      <div class="grid grid-cols-3 gap-2 mb-3">
        <div class="bg-blue-50 rounded-xl p-2.5 text-center border border-blue-100">
          <p class="text-xs text-blue-600 font-bold mb-0.5">男性</p>
          <p class="text-xl font-black text-blue-800">${malePct}<span class="text-sm">%</span></p>
          <p class="text-xs text-blue-400">${demo.maleTotal}名</p>
        </div>
        <div class="bg-pink-50 rounded-xl p-2.5 text-center border border-pink-100">
          <p class="text-xs text-pink-600 font-bold mb-0.5">女性</p>
          <p class="text-xl font-black text-pink-800">${femalePct}<span class="text-sm">%</span></p>
          <p class="text-xs text-pink-400">${demo.femaleTotal}名</p>
        </div>
        <div class="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
          <p class="text-xs text-slate-500 font-bold mb-0.5">合計</p>
          <p class="text-xl font-black text-slate-700">${demo.total}</p>
          <p class="text-xs text-slate-400">名</p>
        </div>
      </div>

      <!-- ピラミッドチャート -->
      <div class="flex justify-between text-xs text-slate-400 mb-1 px-1">
        <span class="text-blue-400 font-bold">← 男性</span>
        <span class="text-pink-400 font-bold">女性 →</span>
      </div>
      <div class="bg-slate-50 rounded-2xl border border-slate-100 p-3" style="height:230px; position:relative;">
        <canvas id="pyramidChart"></canvas>
      </div>

      <!-- 最多年代 -->
      <div class="grid grid-cols-2 gap-2 mt-2">
        <div class="bg-slate-50 rounded-xl p-2.5 border-l-4 border-blue-400">
          <p class="text-xs text-slate-400 mb-0.5">男性最多</p>
          <p class="text-sm font-black text-slate-700">${topMale.label} <span class="text-blue-500">${topMale.male}名</span></p>
        </div>
        <div class="bg-slate-50 rounded-xl p-2.5 border-l-4 border-pink-400">
          <p class="text-xs text-slate-400 mb-0.5">女性最多</p>
          <p class="text-sm font-black text-slate-700">${topFemale.label} <span class="text-pink-500">${topFemale.female}名</span></p>
        </div>
      </div>
    </div>

    <script id="pyramidData" type="application/json">${JSON.stringify({ ageGroups: demo.ageGroups, axisMax })}</script>`;
}

function pyramidScript(demo) {
  if (!demo) return '';
  return `
    const _pd = JSON.parse(document.getElementById('pyramidData').textContent);
    new Chart(document.getElementById('pyramidChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: _pd.ageGroups.map(g => g.label),
        datasets: [
          { label: '男性', data: _pd.ageGroups.map(g => -g.male),   backgroundColor: '#63b3ed', borderRadius: 3, barPercentage: 0.75 },
          { label: '女性', data: _pd.ageGroups.map(g => g.female), backgroundColor: '#f687b3', borderRadius: 3, barPercentage: 0.75 }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + Math.abs(ctx.raw) + '名' } }
        },
        scales: {
          x: {
            min: -_pd.axisMax,
            max:  _pd.axisMax,
            ticks: { callback: v => Math.abs(v), font: { size: 10 }, color: '#94A3B8', maxTicksLimit: 6 },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          y: {
            ticks: { font: { size: 11 }, color: '#4a5568' },
            grid: { display: false }
          }
        }
      }
    });`;
}

function generateHtml(store, comment, demographics = null) {
  const { storeName, month, kpi, salesHistory } = store;
  const { sales, customers, laborCostRate, salesPerHour, laborProductivity } = kpi;

  const laborT = laborTheme(laborCostRate.current);
  const laborMarkerPos = laborCostRate.current !== null ? laborBarPos(laborCostRate.current) : 0;
  const laborTargetPos = laborBarPos(LABOR_TARGET);
  const shiftGap = (salesPerHour !== null && laborProductivity !== null)
    ? salesPerHour - laborProductivity : null;

  const salesDiffMonth  = diff(sales.current, sales.prevMonth);
  const salesDiffYear   = diff(sales.current, sales.prevYear);
  const custDiffMonth   = diff(customers.current, customers.prevMonth);
  const custDiffYear    = diff(customers.current, customers.prevYear);

  const chart = chartData(salesHistory);

  const aiComment = comment ?? {
    trend: 'AIコメントを生成中...',
    point: [],
    nextMonth: '',
  };

  const pointItems = (aiComment.points ?? []).map(p => `
            <li class="flex gap-1.5">
              <span class="text-red-400 flex-shrink-0 mt-0.5">▶</span>
              <span>${p}</span>
            </li>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${storeName} 月次レポート — ${monthLabel(month)}</title>
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

<body class="bg-slate-300 min-h-screen py-8 px-4 flex flex-col items-center gap-4">

  <div id="reportCard" class="bg-white shadow-2xl overflow-hidden rounded-xl">

    <!-- HEADER -->
    <div class="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-5 pt-6 pb-5">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-bold tracking-widest text-teal-300 uppercase">Monthly Report</span>
        <span class="bg-teal-400/20 text-teal-200 text-xs font-bold px-3 py-1 rounded-full border border-teal-400/30">
          ${monthLabel(month)}
        </span>
      </div>
      <h1 class="text-white text-3xl font-black tracking-tight">${storeName}</h1>
      <p class="text-slate-500 text-xs mt-1">${periodLabel(month)}</p>
    </div>

    <!-- KPI CARDS -->
    <div class="px-4 pt-4 space-y-2.5">

      <div class="grid grid-cols-2 gap-2.5">
        <!-- 売上 -->
        <div class="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
          <p class="text-xs text-slate-400 font-medium mb-1.5">売上合計</p>
          <p class="text-xl font-black text-slate-800 leading-none">¥${fmt(sales.current)}</p>
          <div class="mt-2 space-y-0.5">
            <div class="flex items-center gap-1">
              ${arrowHtml(salesDiffMonth)}
              <span class="text-slate-400 text-xs">前月比</span>
            </div>
            <div class="flex items-center gap-1">
              ${arrowHtml(salesDiffYear)}
              <span class="text-slate-400 text-xs">前年同月比</span>
            </div>
          </div>
        </div>
        <!-- 客数 -->
        <div class="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
          <p class="text-xs text-slate-400 font-medium mb-1.5">客数</p>
          <p class="text-xl font-black text-slate-800 leading-none">${fmt(customers.current)} <span class="text-sm font-bold text-slate-400">名</span></p>
          <div class="mt-2 space-y-0.5">
            <div class="flex items-center gap-1">
              ${arrowHtml(custDiffMonth)}
              <span class="text-slate-400 text-xs">前月比</span>
            </div>
            <div class="flex items-center gap-1">
              ${arrowHtml(custDiffYear)}
              <span class="text-slate-400 text-xs">前年同月比</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 人件費率 -->
      <div class="${laborT.bg} rounded-2xl p-3.5 border ${laborT.border}">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs font-medium ${laborT.text}">人件費比率</p>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full ${
            laborCostRate.current > 55 ? 'bg-red-100 text-red-600' :
            laborCostRate.current > 45 ? 'bg-amber-100 text-amber-600' :
            'bg-emerald-100 text-emerald-700'
          }">${laborT.label}</span>
        </div>
        <p class="text-2xl font-black ${laborT.text} leading-none mb-3">${pct(laborCostRate.current)}</p>

        <!-- ゾーンバー（30〜80%） -->
        <div class="relative h-5 rounded-lg overflow-visible mb-1">
          <!-- 背景ゾーン -->
          <div class="absolute inset-0 flex rounded-lg overflow-hidden">
            <div class="bg-emerald-200" style="width:30%"></div>
            <div class="bg-amber-200"   style="width:20%"></div>
            <div class="bg-red-200"     style="width:50%"></div>
          </div>
          <!-- 目標ライン（50%） -->
          <div class="absolute top-0 bottom-0 w-0.5 bg-slate-600 opacity-60" style="left:${laborTargetPos}%"></div>
          <!-- 現在値マーカー -->
          <div class="absolute -top-1 w-3 h-3 rounded-full border-2 border-white shadow-md ${
            laborCostRate.current > 55 ? 'bg-red-500' :
            laborCostRate.current > 45 ? 'bg-amber-500' : 'bg-emerald-500'
          }" style="left:calc(${laborMarkerPos}% - 6px)"></div>
        </div>

        <!-- 軸ラベル -->
        <div class="flex justify-between text-xs text-slate-400 mt-1 mb-2">
          <span>30%</span>
          <span class="text-emerald-600 font-bold">良好</span>
          <span class="text-amber-500 font-bold">適正</span>
          <span class="text-red-500 font-bold">要注意</span>
          <span>80%</span>
        </div>
        <div class="text-xs text-slate-400">目標ライン <span class="font-bold text-slate-600">${LABOR_TARGET}%</span></div>
      </div>

      <!-- シフト効率診断 / 1人シフト稼働状況 -->
      ${store.storeId === 'sakuradai' ? `
      <div class="bg-slate-800 rounded-2xl p-4">
        <p class="text-xs font-bold text-slate-300 mb-0.5">1人シフト稼働状況</p>
        <p class="text-xs text-slate-500 mb-3">1人で店舗を運営しています</p>
        <div class="grid grid-cols-2 gap-3 text-center">
          <div>
            <p class="text-xs text-blue-300 mb-1">時間売上</p>
            <p class="text-lg font-black text-white leading-none">¥${fmt(salesPerHour)}</p>
            <p class="text-xs text-slate-500 mt-0.5">/時間</p>
            <p class="text-xs text-slate-600 mt-1.5">営業1時間あたりの稼ぎ</p>
          </div>
          <div>
            <p class="text-xs text-teal-300 mb-1">客単価</p>
            <p class="text-lg font-black text-white leading-none">¥${fmt(kpi.unitPrice.current)}</p>
            <p class="text-xs text-slate-500 mt-0.5">/名</p>
            <p class="text-xs text-slate-600 mt-1.5">お客様1名あたりの売上</p>
          </div>
        </div>
      </div>` : `
      <div class="bg-slate-800 rounded-2xl p-4">
        <p class="text-xs font-bold text-slate-300 mb-0.5">シフト効率診断</p>
        <p class="text-xs text-slate-500 mb-3">差が大きいほど、無駄なシフトが発生しています</p>
        <div class="grid grid-cols-3 items-center gap-1 text-center">
          <div>
            <p class="text-xs text-blue-300 mb-1">時間売上</p>
            <p class="text-lg font-black text-white leading-none">¥${fmt(salesPerHour)}</p>
            <p class="text-xs text-slate-500 mt-0.5">/時間</p>
            <p class="text-xs text-slate-600 mt-1.5">営業1時間あたりの稼ぎ</p>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="${shiftGap !== null && shiftGap > 1000 ? 'bg-red-500/20 border-red-500/30' : 'bg-emerald-500/20 border-emerald-500/30'} border rounded-xl px-3 py-1.5">
              <p class="text-xs ${shiftGap !== null && shiftGap > 1000 ? 'text-red-400' : 'text-emerald-400'}">差</p>
              <p class="text-base font-black ${shiftGap !== null && shiftGap > 1000 ? 'text-red-300' : 'text-emerald-300'}">¥${fmt(shiftGap)}</p>
            </div>
            <p class="text-xs text-slate-600">差/時間</p>
          </div>
          <div>
            <p class="text-xs text-teal-300 mb-1">労働生産性</p>
            <p class="text-lg font-black text-white leading-none">¥${fmt(laborProductivity)}</p>
            <p class="text-xs text-slate-500 mt-0.5">/時間</p>
            <p class="text-xs text-slate-600 mt-1.5">スタッフ1時間あたりの稼ぎ</p>
          </div>
        </div>
      </div>`}

    </div>

    <!-- 売上推移グラフ（6ヶ月） -->
    <div class="px-4 pt-4">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-xs font-bold text-slate-700">売上推移（直近6ヶ月）</h2>
        <span class="text-xs text-slate-400">単位：万円</span>
      </div>
      <div class="bg-slate-50 rounded-2xl border border-slate-100 p-3" style="height:160px; position:relative;">
        <canvas id="salesChart"></canvas>
      </div>
    </div>

    ${pyramidSection(demographics)}

    <!-- AIコメント -->
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
          <p class="text-xs text-amber-900 leading-relaxed">${aiComment.trend}</p>
        </div>

        ${pointItems ? `
        <div class="mb-3 bg-red-50 rounded-xl p-3 border border-red-100">
          <p class="text-xs font-bold text-red-600 mb-2">注目ポイント</p>
          <ul class="text-xs text-red-900 space-y-2">${pointItems}
          </ul>
        </div>` : ''}

        ${aiComment.nextMonth ? `
        <div>
          <p class="text-xs font-bold text-amber-700 mb-1">来月に向けて</p>
          <p class="text-xs text-amber-900 leading-relaxed">${aiComment.nextMonth}</p>
        </div>` : ''}
      </div>
    </div>

    <!-- FOOTER -->
    <div class="bg-slate-900 px-5 py-3 flex items-center justify-between">
      <p class="text-xs text-slate-500">${storeName} 月次レポート</p>
      <p class="text-xs text-slate-500">${month.replace('-', '.')} / 自動生成</p>
    </div>

  </div>

  <script>
    Chart.defaults.font.family = '"Noto Sans JP", sans-serif';
    Chart.defaults.animation = false;

    const salesData = ${chart.values};
    const maxSales = Math.max(...salesData);
    const minY = Math.floor(Math.min(...salesData) * 0.9 / 10) * 10;
    const maxY = Math.ceil(maxSales * 1.05 / 10) * 10;

    new Chart(document.getElementById('salesChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: ${chart.labels},
        datasets: [{
          data: salesData,
          backgroundColor: ${chart.colors},
          borderRadius: 5,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => '¥' + (ctx.parsed.y * 10000).toLocaleString() + '万' } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94A3B8' } },
          y: {
            min: minY, max: maxY,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { font: { size: 10 }, color: '#94A3B8', callback: v => v + '万' }
          }
        }
      }
    });

    ${pyramidScript(demographics)}

    window.__chartsReady = true;
  </script>

</body>
</html>`;
}

async function main() {
  const storeDataPath = path.join(dataDir, 'store-data.json');
  const raw = JSON.parse(await fs.readFile(storeDataPath, 'utf-8'));

  // AIコメントがあれば読み込む（なければ空）
  let aiComments = {};
  try {
    aiComments = JSON.parse(await fs.readFile(path.join(dataDir, 'ai-comments.json'), 'utf-8'));
  } catch {
    console.log('ℹ️  ai-comments.json が見つかりません。AIコメントなしで生成します。');
  }

  // 客層データがあれば読み込む（なければスキップ）
  let demographicsData = {};
  try {
    const demo = JSON.parse(await fs.readFile(path.join(dataDir, 'demographics.json'), 'utf-8'));
    demographicsData = demo.stores ?? {};
    console.log('✅ demographics.json を読み込みました');
  } catch {
    console.log('ℹ️  demographics.json が見つかりません。客層ピラミッドなしで生成します。');
  }

  await fs.mkdir(outputDir, { recursive: true });

  for (const store of raw.stores) {
    const demographics = demographicsData[store.storeId] ?? null;
    const html = generateHtml(store, aiComments[store.storeId] ?? null, demographics);
    const outPath = path.join(outputDir, `report-${store.storeId}.html`);
    await fs.writeFile(outPath, html, 'utf-8');
    console.log(`✅ ${store.storeName} → output/report-${store.storeId}.html`);
  }

  console.log('\n💾 output/ フォルダにHTMLを生成しました');
}

main().catch(err => { console.error(err); process.exit(1); });
