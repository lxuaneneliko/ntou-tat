// Local mock AIS account only; public activity fixtures contain no personal data.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/lxuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' })
const checks = [], errors = [], measurements = [], requests = []
const fixtures = [
  { id: 'qa-campus-club', clubId: 'maker', title: '3D 列印與 AI 手作工作坊開放報名，歡迎同學一起參加體驗課程', organizer: '創客社', category: '社課' },
  { id: 'qa-campus-school', clubId: null, title: '海洋研究系列講座', organizer: '海洋中心', category: '講座' },
  { id: 'qa-campus-school-two', clubId: null, title: '海洋科學展覽', organizer: '圖書館', category: '展覽' },
].map((item) => ({ ...item, startsAt: '2030-10-11T16:00:00Z', endsAt: '2030-10-18T16:00:00Z', datePrecision: 'date', dateNote: '實際時段請見公告', location: '海大校內', sourceUrl: 'https://www.ntou.edu.tw/', audience: '在校生', description: '活動詳情與報名說明' }))
let failFeed = false
await page.route('https://ntou-campus-api.ntou-campus.workers.dev/**', (route) => {
  requests.push({ url: route.request().url(), headers: route.request().headers() })
  return route.fulfill({ status: failFeed ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ items: fixtures, total: fixtures.length }) })
})
page.on('pageerror', (error) => errors.push(error.message))
const pass = (text) => { checks.push(text); console.log('PASS', text) }
const nav = async (name) => { if (!await page.locator('.bottom-nav').isVisible()) await page.getByRole('button', { name: '返回', exact: true }).click(); await page.locator('.bottom-nav').getByRole('button', { name, exact: true }).click(); await page.evaluate(() => window.scrollTo(0, 0)) }
const headline = () => page.locator('.campus-bulletin-headline').innerText()
const screen = (name) => page.screenshot({ path: fileURLToPath(new URL('../qa/' + name + '.png', import.meta.url)), animations: 'disabled' })
const login = async (target) => {
  await target.goto('http://127.0.0.1:5317')
  await target.locator('input[name=studentId]').fill('QA_ONLY'); await target.locator('input[name=password]').fill('QA_ONLY')
  await target.getByRole('button', { name: '登入', exact: true }).click()
  await target.locator('.bottom-nav').waitFor()
  await target.waitForFunction(() => document.querySelector('.campus-bulletin-headline')?.textContent?.includes('｜'))
}
const settings = async () => { await nav('其他'); await page.getByRole('button', { name: '帳號與設定', exact: true }).click() }
const calendar = async () => { await nav('其他'); await page.getByRole('button', { name: '行事曆', exact: true }).click(); await page.evaluate(() => window.scrollTo(0, 0)) }
try {
  await page.clock.install(); await login(page)
  assert.deepEqual(await page.locator('.bottom-nav .nav-button span').allTextContents(), ['課表', '活動', '成績', '信箱', '其他'])
  await nav('活動'); assert.equal(await page.getByRole('button', { name: '返回', exact: true }).count(), 0)
  await page.locator('.activity-list-item').first().waitFor(); assert.equal(await page.locator('.activity-list-item').count(), 3)
  assert.equal(requests.length, 1, 'List and banner must share one feed request')
  await calendar(); assert.equal(await page.getByRole('button', { name: '返回', exact: true }).count(), 1)
  await page.getByRole('button', { name: '返回', exact: true }).click(); await page.locator('.tat-identity-card').waitFor()
  pass('Activities replaces the second bottom slot; Calendar remains complete in Other with correct back navigation')

  await nav('活動'); await page.getByRole('button', { name: '社團', exact: true }).click()
  assert.equal(await page.locator('.activity-list-item').count(), 1)
  await page.getByRole('button', { name: '校園', exact: true }).click(); assert.equal(await page.locator('.activity-list-item').count(), 2)
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await page.getByLabel('活動類型').selectOption('講座'); assert.equal(await page.locator('.activity-list-item').count(), 1)
  await page.getByLabel('活動類型').selectOption(''); await page.getByRole('searchbox', { name: '搜尋活動' }).fill('ai 海大')
  assert.equal(await page.locator('.activity-list-item').count(), 1)
  await page.getByRole('searchbox', { name: '搜尋活動' }).fill('不存在')
  await page.getByText('沒有符合條件的活動', { exact: true }).waitFor(); await page.getByRole('button', { name: '清除篩選', exact: true }).click()
  assert.equal(await page.locator('.activity-list-item').count(), 3)
  await page.locator('.activity-list-item').first().click(); await page.locator('.campus-bulletin-dialog').waitFor()
  assert.match(await page.locator('.campus-bulletin-facts').innerText(), /2030\/10\/12 – 2030\/10\/18/)
  assert.doesNotMatch(await page.locator('.campus-bulletin-facts').innerText(), /00:00|全天/)
  assert.equal(await page.getByRole('link', { name: '原始公告', exact: true }).getAttribute('href'), 'https://www.ntou.edu.tw/')
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.campus-bulletin-dialog').count(), 0)
  await screen('27-test6-activities-dark')
  pass('Native activity listing supports source/type/search filters, clear filters, accurate dates, and event details')

  for (const mode of ['dark', 'light']) {
    if (mode === 'light') { await settings(); await page.getByRole('button', { name: '白天模式', exact: true }).click(); await page.getByRole('button', { name: '返回', exact: true }).click() }
    for (const [width, height] of [[320, 740], [390, 844], [430, 932]]) {
      await page.setViewportSize({ width, height })
      for (const name of ['課表', '活動', '成績', '信箱', '其他', '行事曆', '校務公告']) {
        if (name === '行事曆') await calendar()
        else if (name === '校務公告') { await nav('其他'); await page.getByRole('button', { name, exact: true }).click() }
        else await nav(name)
        await page.evaluate(() => window.scrollTo(0, 0))
        const measured = await page.locator('.campus-bulletin').evaluate((el) => ({ height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left, overflow: document.documentElement.scrollWidth > innerWidth + 1, text: el.textContent }))
        assert.equal(measured.height, 50, `${name} ${width} ${mode}`); assert.equal(measured.overflow, false)
        assert.equal(await page.locator('.campus-bulletin-count').count(), 0)
        assert.equal(await page.locator('.campus-bulletin button').count(), 2)
        assert.doesNotMatch(measured.text, /\d+\s*\/\s*\d+/)
        assert.equal(await page.locator('.campus-bulletin').getByRole('button', { name: /暫停|播放/ }).count(), 0)
        measurements.push({ mode, viewport: { width, height }, page: name, ...measured })
      }
    }
  }
  await nav('活動'); await page.setViewportSize({ width: 390, height: 844 }); await screen('28-test6-activities-light')
  pass('Bulletin is exactly 50px on seven pages across three phone widths and both themes, with no counters or pause/play button')

  await calendar()
  for (const [width, height] of [[320, 740], [390, 844], [430, 932], [390, 640]]) {
    await page.setViewportSize({ width, height }); await page.getByLabel('跳至日期').fill('2026-08-15'); await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForFunction(() => { const bottom = document.querySelector('.calendar-grid').getBoundingClientRect().bottom, navTop = document.querySelector('.bottom-nav').getBoundingClientRect().top; return bottom < navTop - 5 && bottom > navTop - 16 })
    assert.equal(await page.locator('.calendar-day').count(), 42)
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByLabel('跳至日期').fill('2026-10-10'); await screen('29-test6-calendar-in-other')
  pass('Moving Calendar into Other preserves 42 visible date cells at four screen sizes')

  await nav('課表'); await page.mouse.move(1, 1); await page.evaluate(() => document.activeElement?.blur())
  const first = await headline(); await page.clock.runFor(6800); assert.notEqual(await headline(), first)
  assert.equal(await page.locator('.campus-bulletin-headline').evaluate((el) => getComputedStyle(el).animationName), 'campus-bulletin-enter')
  await settings(); await page.getByRole('checkbox', { name: '快報自動輪播', exact: true }).uncheck()
  await nav('課表'); await page.mouse.move(1, 1); await page.evaluate(() => document.activeElement?.blur())
  const stopped = await headline(); await page.clock.runFor(14000); assert.equal(await headline(), stopped)
  await page.getByRole('button', { name: '下一則校園快報', exact: true }).click(); assert.notEqual(await headline(), stopped)
  await settings(); await page.getByRole('checkbox', { name: '快報自動輪播', exact: true }).check(); await nav('課表'); await page.mouse.move(1, 1); await page.evaluate(() => document.activeElement?.blur())
  const resumed = await headline(); await page.clock.runFor(6800); assert.notEqual(await headline(), resumed)
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(150); const reduced = await headline(); await page.clock.runFor(14000); assert.equal(await headline(), reduced)
  assert.equal(await page.locator('.campus-bulletin-headline').evaluate((el) => getComputedStyle(el).animationName), 'none')
  await page.getByRole('button', { name: '下一則校園快報', exact: true }).click(); assert.notEqual(await headline(), reduced)
  await screen('30-test6-timetable-uniform-bulletin')
  pass('Float-in loop and manual-next still work; rotation preference and reduced-motion remain accessible without banner pause controls')

  failFeed = true; await nav('活動'); await page.getByRole('button', { name: '重新整理', exact: true }).click()
  await page.getByText('離線快取', { exact: true }).last().waitFor(); assert.equal(await page.locator('.activity-list-item').count(), 3)
  assert.ok(requests.every((request) => !request.headers.authorization && !request.headers.cookie))
  pass('Offline list/banner share recent labeled public cache and never send AIS credentials')

  const upgraded = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await upgraded.addInitScript(() => localStorage.setItem('ntou-appearance-v3', JSON.stringify({ mode: 'light', brand: '#ffffff', background: '#f7f9fc', text: '#20313d', button: '#c83f43', navigation: ['mail', 'calendar', 'portal', 'grades', 'more'] })))
    await upgraded.route('https://ntou-campus-api.ntou-campus.workers.dev/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: fixtures, total: 3 }) }))
    await login(upgraded)
    assert.deepEqual(await upgraded.locator('.bottom-nav .nav-button span').allTextContents(), ['信箱', '活動', '校務系統', '成績', '其他'])
    assert.equal(await upgraded.evaluate(() => document.documentElement.style.getPropertyValue('--active')), '#c83f43')
    pass('Test.5 saved navigation migrates the exact Calendar slot without resetting custom colors or other pins')
  } finally { await upgraded.close() }

  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' })
  try {
    await touch.route('https://ntou-campus-api.ntou-campus.workers.dev/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: fixtures, total: 3 }) }))
    await touch.clock.install(); await login(touch)
    await touch.locator('.campus-bulletin-open').tap(); await touch.getByRole('button', { name: '關閉活動詳情', exact: true }).tap()
    const before = await touch.locator('.campus-bulletin-headline').innerText(); await touch.clock.runFor(6800)
    assert.notEqual(await touch.locator('.campus-bulletin-headline').innerText(), before)
    pass('Touch detail close does not leave rotation stuck on hover or focus')
  } finally { await touch.close() }
  assert.deepEqual(errors, [])
  writeFileSync(new URL('../qa/test6-ui-results.json', import.meta.url), JSON.stringify({ checks, errors, measurements, requestCount: requests.length, mockOnly: true }, null, 2))
} catch (error) { await screen('test6-failure'); throw error } finally { await browser.close() }
