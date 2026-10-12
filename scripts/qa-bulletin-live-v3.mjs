// Real public campus API; AIS login stays synthetic and no public writes occur.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/lxuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
const errors = [], responses = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('response', (response) => { if (response.url().startsWith('https://ntou-campus-api.ntou-campus.workers.dev/')) responses.push({ url: response.url(), status: response.status(), cors: response.headers()['access-control-allow-origin'] }) })
try {
  await page.goto('http://127.0.0.1:5317')
  await page.locator('input[name=studentId]').fill('QA_ONLY'); await page.locator('input[name=password]').fill('QA_ONLY')
  await page.getByRole('button', { name: '登入', exact: true }).click(); await page.locator('.bottom-nav').waitFor()
  await page.waitForFunction(() => /\/ \d+/.test(document.querySelector('.campus-bulletin-count')?.textContent || '') && !document.querySelector('.campus-bulletin-meta small'), { timeout: 18000 })
  const count = await page.locator('.campus-bulletin-count').innerText(), title = await page.locator('.campus-bulletin-headline').innerText()
  assert.ok(responses.some((response) => response.status === 200 && response.cors === '*'))
  await page.locator('.campus-bulletin-open').click(); await page.locator('.campus-bulletin-dialog').waitFor()
  const detailUrl = await page.getByRole('link', { name: '活動平台' }).getAttribute('href')
  const publicPage = await page.request.get(detailUrl); assert.equal(publicPage.status(), 200)
  await page.screenshot({ path: fileURLToPath(new URL('../qa/27-test5-live-campus-detail.png', import.meta.url)), fullPage: false })
  await page.getByRole('button', { name: '關閉活動詳情' }).click(); await page.locator('.bottom-nav').getByText('行事曆', { exact: true }).click()
  await page.getByLabel('跳至日期').fill('2026-10-10'); await page.screenshot({ path: fileURLToPath(new URL('../qa/28-test5-live-calendar.png', import.meta.url)), fullPage: false })
  assert.deepEqual(errors, [])
  const result = { checkedAt: new Date().toISOString(), responses, count, title, detailUrl, detailPageStatus: publicPage.status(), errors, aisMockOnly: true, publicWrites: false }
  writeFileSync(new URL('../qa/test5-live-bulletin-results.json', import.meta.url), JSON.stringify(result, null, 2))
  console.log('PASS Real public API CORS/feed and public activity detail:', count, title)
} finally { await browser.close() }
