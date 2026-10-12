// Read-only live public feed; mock AIS login never uses a real school account.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/lxuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
const errors = [], responses = [], requests = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('request', (request) => { if (request.url().startsWith('https://ntou-campus-api.ntou-campus.workers.dev/')) requests.push({ url: request.url(), headers: request.headers() }) })
page.on('response', (response) => { if (response.url().startsWith('https://ntou-campus-api.ntou-campus.workers.dev/')) responses.push({ url: response.url(), status: response.status(), cors: response.headers()['access-control-allow-origin'] }) })
try {
  await page.goto('http://127.0.0.1:5317')
  await page.locator('input[name=studentId]').fill('QA_ONLY'); await page.locator('input[name=password]').fill('QA_ONLY')
  await page.getByRole('button', { name: '登入', exact: true }).click(); await page.locator('.bottom-nav').waitFor()
  await page.locator('.bottom-nav').getByRole('button', { name: '活動', exact: true }).click()
  await page.locator('.activity-list-item').first().waitFor({ timeout: 18000 })
  assert.ok(responses.some((response) => response.status === 200 && response.cors === '*'))
  const loaded = await page.locator('.activity-list-item').count(), title = await page.locator('.activity-list-item strong').first().innerText()
  await page.screenshot({ path: fileURLToPath(new URL('../qa/31-test6-live-activities.png', import.meta.url)), fullPage: false })
  await page.getByRole('button', { name: '校園', exact: true }).click(); const campus = await page.locator('.activity-list-item').count()
  await page.getByRole('button', { name: '社團', exact: true }).click(); const clubs = await page.locator('.activity-list-item').count()
  await page.getByRole('button', { name: '全部', exact: true }).click()
  assert.equal(campus + clubs, loaded, 'Live API has explicit clubId for every event')
  await page.locator('.activity-list-item').first().click(); await page.locator('.campus-bulletin-dialog').waitFor()
  const detailUrl = await page.getByRole('link', { name: '活動平台', exact: true }).getAttribute('href')
  const publicPage = await page.request.get(detailUrl); assert.equal(publicPage.status(), 200)
  assert.ok(requests.every((request) => !request.headers.cookie && !request.headers.authorization))
  assert.deepEqual(errors, [])
  const result = { checkedAt: new Date().toISOString(), responses, loaded, campus, clubs, title, detailUrl, detailPageStatus: publicPage.status(), errors, aisMockOnly: true, publicWrites: false, credentialsAbsent: true }
  writeFileSync(new URL('../qa/test6-live-activities-results.json', import.meta.url), JSON.stringify(result, null, 2))
  console.log('PASS Real public API activities, source filters and public details', JSON.stringify(result))
} finally { await browser.close() }
