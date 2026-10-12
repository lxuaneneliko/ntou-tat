// Mock AIS login and synthetic announcements only. No personal credentials.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/lxuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' })
const checks = [], errors = [], measurements = [], requests = []
const fixture = Array.from({ length: 3 }, (_, i) => ({ id: 'qa-campus-' + i, title: ['校園手作課開放報名', '海洋研究系列講座', '本週社團活動整理'][i], organizer: ['創客社', '海洋中心', '學生社團'][i], category: '講座', startsAt: '2030-10-11T16:00:00Z', endsAt: '2030-10-18T16:00:00Z', datePrecision: 'date', dateNote: '實際時段請見公告', location: '海大校內', sourceUrl: 'https://www.ntou.edu.tw/', audience: '在校生', description: '測試活動詳情' }))
let failFeed = false
await page.route('https://ntou-campus-api.ntou-campus.workers.dev/**', (route) => {
  requests.push({ url: route.request().url(), headers: route.request().headers() })
  return route.fulfill({ status: failFeed ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ items: fixture, total: 3 }) })
})
page.on('pageerror', (error) => errors.push(error.message))
const pass = (text) => { checks.push(text); console.log('PASS', text) }
const headline = () => page.locator('.campus-bulletin-headline').innerText()
const nav = async (name) => { await page.locator('.bottom-nav').getByText(name, { exact: true }).click(); await page.evaluate(() => window.scrollTo(0, 0)) }
const screen = (name) => page.screenshot({ path: fileURLToPath(new URL('../qa/' + name + '.png', import.meta.url)), fullPage: true, animations: 'disabled' })
try {
  await page.clock.install()
  await page.goto('http://127.0.0.1:5317')
  await page.locator('input[name=studentId]').fill('QA_ONLY'); await page.locator('input[name=password]').fill('QA_ONLY')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.locator('.bottom-nav').waitFor(); await page.waitForFunction(() => document.querySelector('.campus-bulletin-count')?.textContent?.includes('/ 3'))
  for (const name of ['課表', '行事曆', '成績', '信箱', '其他']) { await nav(name); assert.equal(await page.locator('.campus-bulletin').count(), 1) }
  await page.getByRole('button', { name: '校務公告', exact: true }).click(); assert.equal(await page.locator('.campus-bulletin').count(), 1)
  await page.getByRole('button', { name: '返回', exact: true }).click(); await page.getByRole('button', { name: '帳號與設定', exact: true }).click(); assert.equal(await page.locator('.campus-bulletin').count(), 1)
  await page.getByRole('button', { name: '返回', exact: true }).click(); await nav('課表')
  pass('One persistent bulletin appears on all five main pages and nested announcements/settings pages')
  await page.mouse.move(1, 1); await page.evaluate(() => document.activeElement?.blur()); await page.clock.runFor(6800)
  const first = await headline(); await page.clock.runFor(6800); const second = await headline(); assert.notEqual(first, second)
  assert.equal(await page.locator('.campus-bulletin-headline').evaluate((element) => getComputedStyle(element).animationName), 'campus-bulletin-enter')
  await page.getByRole('button', { name: '暫停校園快報' }).click(); const paused = await headline(); await page.clock.runFor(15000); assert.equal(await headline(), paused)
  await page.getByRole('button', { name: '播放校園快報' }).click(); await page.clock.runFor(6800); assert.notEqual(await headline(), paused)
  await page.getByRole('button', { name: '下一則校園快報' }).click(); assert.notEqual(await headline(), paused)
  await screen('23-test5-campus-bulletin-dark')
  pass('Bulletins loop automatically with float-in/fade, and pause/play/manual-next controls work')
  await page.emulateMedia({ reducedMotion: 'reduce' }); const reduced = await headline(); await page.clock.runFor(14000); assert.equal(await headline(), reduced)
  assert.equal(await page.locator('.campus-bulletin-headline').evaluate((element) => getComputedStyle(element).animationName), 'none')
  await page.getByRole('button', { name: '下一則校園快報' }).click(); assert.notEqual(await headline(), reduced)
  pass('Reduced motion disables animation and automatic rotation unless explicitly played')
  await page.locator('.campus-bulletin-open').click(); await page.locator('.campus-bulletin-dialog').waitFor()
  assert.match(await page.locator('.campus-bulletin-facts').innerText(), /2030\/10\/12 – 2030\/10\/18/)
  assert.doesNotMatch(await page.locator('.campus-bulletin-facts').innerText(), /00:00|全天/)
  assert.equal(await page.getByRole('link', { name: '原始公告' }).getAttribute('href'), 'https://www.ntou.edu.tw/')
  assert.match(await page.getByRole('link', { name: '活動平台' }).getAttribute('href'), /\/events\/qa-campus-/)
  await screen('24-test5-campus-event-detail'); await page.keyboard.press('Escape'); assert.equal(await page.locator('.campus-bulletin-dialog').count(), 0)
  pass('Details show dates accurately, use public source/platform links and close with Escape')
  await nav('行事曆')
  for (const [width, height] of [[320, 740], [390, 844], [430, 932], [390, 640]]) {
    await page.setViewportSize({ width, height }); await page.getByLabel('跳至日期').fill('2026-08-15'); await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForFunction(() => { const bottom = document.querySelector('.calendar-grid').getBoundingClientRect().bottom, navTop = document.querySelector('.bottom-nav').getBoundingClientRect().top; return bottom < navTop - 5 && bottom > navTop - 16 })
    const measured = await page.evaluate(() => { const element = document.querySelector('.calendar-grid'), grid = element.getBoundingClientRect(), nav = document.querySelector('.bottom-nav').getBoundingClientRect(); return { left: grid.left, right: innerWidth - grid.right, bottom: grid.bottom, navTop: nav.top, rowHeight: getComputedStyle(element).getPropertyValue('--month-row-height'), overflow: document.documentElement.scrollWidth > innerWidth + 1 } })
    assert.equal(await page.locator('.calendar-day').count(), 42); assert.equal(measured.overflow, false); assert.ok(measured.left >= 12 && measured.right >= 12)
    measurements.push({ width, height, ...measured })
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByLabel('跳至日期').fill('2026-10-10'); await screen('25-test5-calendar-dark')
  await nav('其他'); await page.getByRole('button', { name: '帳號與設定', exact: true }).click(); await page.getByRole('button', { name: '白天模式', exact: true }).click(); await page.getByRole('button', { name: '返回', exact: true }).click(); await nav('行事曆'); await screen('26-test5-calendar-light')
  assert.equal(await page.locator('.calendar-v3 .calendar-day').first().evaluate((element) => element.style.backgroundColor.length > 0), true)
  pass('The compact calendar still fits all 42 cells at four phone sizes, with theme-derived light/dark colors')
  failFeed = true; await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.waitForFunction(() => document.querySelector('.campus-bulletin-meta')?.textContent?.includes('離線快取'))
  assert.ok((await headline()).length > 0); assert.ok(requests.every((request) => !request.headers.authorization && !request.headers.cookie))
  pass('Network failure uses labeled recent public cache; no authentication headers/cookies are sent')
  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' })
  try {
    await touch.route('https://ntou-campus-api.ntou-campus.workers.dev/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: fixture, total: 3 }) }))
    await touch.clock.install(); await touch.goto('http://127.0.0.1:5317')
    await touch.locator('input[name=studentId]').fill('QA_ONLY'); await touch.locator('input[name=password]').fill('QA_ONLY'); await touch.getByRole('button', { name: '登入', exact: true }).click()
    await touch.waitForFunction(() => document.querySelector('.campus-bulletin-count')?.textContent?.includes('/ 3'))
    await touch.locator('.campus-bulletin-open').tap(); await touch.getByRole('button', { name: '關閉活動詳情' }).tap()
    const before = await touch.locator('.campus-bulletin-headline').innerText(); await touch.clock.runFor(6800)
    assert.notEqual(await touch.locator('.campus-bulletin-headline').innerText(), before)
    pass('On touch screens, closing an activity detail resumes rotation without sticky hover/focus pauses')
  } finally { await touch.close() }
  assert.deepEqual(errors, [])
  writeFileSync(new URL('../qa/test5-bulletin-results.json', import.meta.url), JSON.stringify({ checks, errors, measurements, requestCount: requests.length, mockOnly: true }, null, 2))
} finally { await browser.close() }
