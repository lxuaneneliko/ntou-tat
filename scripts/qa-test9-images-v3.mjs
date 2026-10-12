// Mock school account and synthetic event dates; real existing public posters.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/lxuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
const checks = [], errors = [], mediaRequests = [], measurements = []
const sources = [
  { id: 'image-school', title: '水彩展', sourceUrl: 'https://art.ntou.edu.tw/p/406-1091-128881,r1034.php?Lang=zh-tw', clubId: null, organizer: '藝文中心' },
  { id: 'image-club', title: '救生員訓練班', sourceUrl: 'https://www.instagram.com/enjoywater/p/DdT2xNbzsOF/', clubId: 'water', organizer: '樂水社' },
  { id: 'no-image', title: '無圖片公告', sourceUrl: 'https://www.ntou.edu.tw/', clubId: null, organizer: '海大' },
  { id: 'missing-image', title: '圖片失效活動', sourceUrl: 'https://www.instagram.com/p/MissingCapture_123/', clubId: 'test', organizer: '測試社團' },
].map((item) => ({ ...item, category: '活動', startsAt: '2030-10-11T16:00:00Z', endsAt: '2030-10-18T16:00:00Z', datePrecision: 'date', location: '海大校內', description: '活動詳細資訊' }))
let failFeed = false
await page.route('https://ntou-campus-api.ntou-campus.workers.dev/**', (route) => route.fulfill({ status: failFeed ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ items: sources, total: sources.length }) }))
await page.route('**/media/ig-MissingCapture_123.webp', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>SPA fallback, not an image</html>' }))
page.on('pageerror', (error) => errors.push(error.message))
page.on('request', (request) => { if (request.url().includes('ntou-campus.vercel.app/media/')) mediaRequests.push({ url: request.url(), headers: request.headers() }) })
const pass = (text) => { checks.push(text); console.log('PASS', text) }
const nav = (name) => page.locator('.bottom-nav').getByRole('button', { name, exact: true }).click()
const card = (title) => page.locator('.activity-list-item').filter({ has: page.getByText(title, { exact: true }) })
const loaded = (selector) => page.waitForFunction((selector) => { const img = document.querySelector(selector); return img && img.complete && img.naturalWidth > 0 }, selector)
const screen = (name) => page.screenshot({ path: fileURLToPath(new URL('../qa/' + name + '.png', import.meta.url)), animations: 'disabled' })
try {
  await page.goto('http://127.0.0.1:5317')
  await page.locator('input[name=studentId]').fill('QA_ONLY'); await page.locator('input[name=password]').fill('QA_ONLY')
  await page.getByRole('button', { name: '登入', exact: true }).click(); await page.locator('.bottom-nav').waitFor()
  assert.equal(mediaRequests.length, 0, 'Timetable bulletin must not fetch large poster images')
  await nav('活動'); await card('水彩展').waitFor(); await loaded('.activity-list-item img[src$="watercolor-exhibition.jpg"]')
  assert.equal(await card('水彩展').locator('img').getAttribute('loading'), 'lazy')
  assert.equal(await card('水彩展').locator('img').evaluate((el) => getComputedStyle(el).objectFit), 'contain')
  await screen('32-test9-poster-list-dark')
  await card('救生員訓練班').scrollIntoViewIfNeeded(); await loaded('.activity-list-item img[src$="ig-DdT2xNbzsOF.webp"]')
  pass('Existing official and account-prefixed IG post images load inside native activity cards, using complete uncropped covers and lazy loading')
  await card('救生員訓練班').click(); await loaded('.campus-bulletin-dialog .activity-poster img')
  assert.equal(await page.locator('.campus-bulletin-dialog img').getAttribute('loading'), 'eager')
  assert.equal(await page.getByRole('link', { name: '原始公告', exact: true }).getAttribute('href'), sources[1].sourceUrl)
  assert.ok((await page.locator('.activity-poster-credit').innerText()).length > 0)
  await screen('33-test9-ig-poster-detail'); await page.keyboard.press('Escape')
  pass('Event details display the same original image, attribution and unchanged original-post link')
  assert.equal(await card('無圖片公告').locator('.activity-poster').count(), 0)
  await card('圖片失效活動').scrollIntoViewIfNeeded()
  await card('圖片失效活動').locator('.activity-poster').waitFor({ state: 'detached' })
  await card('圖片失效活動').click(); await page.getByRole('heading', { name: '圖片失效活動', exact: true }).waitFor()
  await page.locator('.campus-bulletin-dialog .activity-poster').waitFor({ state: 'detached' }); await page.keyboard.press('Escape')
  assert.equal(await page.locator('.activity-list-item').count(), 4)
  pass('Unpictured and failed-image activities retain readable cards/details without broken images or invented replacements')
  for (const mode of ['dark', 'light']) {
    if (mode === 'light') { await nav('其他'); await page.getByRole('button', { name: '外觀設定', exact: true }).click(); await page.getByRole('button', { name: '白天模式', exact: true }).click(); await page.getByRole('button', { name: '返回', exact: true }).click(); await nav('活動') }
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 }); await page.evaluate(() => window.scrollTo(0, 0))
      const size = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, bannerHeight: document.querySelector('.campus-bulletin').getBoundingClientRect().height, posterWidth: document.querySelector('.activity-poster').getBoundingClientRect().width }))
      assert.equal(size.overflow, false); assert.equal(size.bannerHeight, 50); assert.ok(size.posterWidth < width)
      measurements.push({ mode, viewportWidth: width, ...size })
    }
  }
  await page.setViewportSize({ width: 390, height: 844 }); await screen('34-test9-poster-list-light')
  assert.equal(await page.locator('.campus-bulletin-count').count(), 0)
  assert.equal(await page.locator('.campus-bulletin').getByRole('button', { name: /暫停|播放/ }).count(), 0)
  pass('Picture cards fit all three phone widths and both themes; the 50px bulletin still has no count/pause controls')
  failFeed = true; await page.getByRole('button', { name: '重新整理', exact: true }).click(); await page.getByText('離線快取', { exact: true }).last().waitFor()
  assert.equal(await page.locator('.activity-list-item').count(), 4)
  assert.ok(mediaRequests.every((request) => !request.headers.cookie && !request.headers.authorization && !request.headers.referer))
  assert.equal(await page.locator('iframe').count(), 0)
  assert.deepEqual(errors, [])
  pass('Pictures use anonymous platform assets without credentials/referrer/IG embeds; cached activities survive a feed outage')
  writeFileSync(new URL('../qa/test9-image-results.json', import.meta.url), JSON.stringify({ checks, errors, measurements, mediaRequests, aisMockOnly: true }, null, 2))
} catch (error) { await screen('test9-images-failure'); throw error } finally { await browser.close() }
