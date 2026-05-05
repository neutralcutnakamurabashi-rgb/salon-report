#!/usr/bin/env node
/**
 * send-manager-email.js
 * Nodemailer + Gmail でHTMLメールを送信する
 *
 * SEND_MODE=preview → 自分宛（確認用）
 * SEND_MODE=send    → 大西店長宛（本送信）
 */

import 'dotenv/config';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GMAIL_USER       = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const MANAGER_EMAIL    = process.env.MANAGER_EMAIL;
const SEND_MODE        = process.env.SEND_MODE ?? 'preview'; // 'preview' or 'send'

async function main() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('❌ GMAIL_USER または GMAIL_APP_PASSWORD が未設定です');
    process.exit(1);
  }

  const htmlPath = path.join(__dirname, '..', 'output', 'manager-email.html');
  const html = await fs.readFile(htmlPath, 'utf-8');

  const dataPath = path.join(__dirname, '..', 'data', 'manager-report.json');
  const data = JSON.parse(await fs.readFile(dataPath, 'utf-8'));

  const [year, mo] = data.latestMonth.split('-');
  const monthLabel = `${year}年${parseInt(mo)}月`;

  const isPreview = SEND_MODE === 'preview';
  const to = isPreview ? GMAIL_USER : (MANAGER_EMAIL ?? GMAIL_USER);

  const subject = isPreview
    ? `【プレビュー確認】月次レポート ${monthLabel}度`
    : `月次レポート ${monthLabel}度 — Neutral`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  console.log(`📧 送信モード: ${isPreview ? 'プレビュー（自分宛）' : '本送信（大西店長宛）'}`);
  console.log(`📬 送信先: ${to}`);

  await transporter.sendMail({
    from: `"Neutral 月次レポート" <${GMAIL_USER}>`,
    to,
    subject,
    html,
  });

  console.log('✅ メール送信完了');
  if (isPreview) {
    console.log('\n👉 メールを確認して問題なければ GitHub Actions の');
    console.log('   「manager-email-send」ワークフローを手動実行してください。');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
