// Mock public content only; never sends a real meetup or school session.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/lxuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = [], checks = [], sizes = []
const campus = { id: 'qa-campus-one', title: '海大科技講座', organizer: '創客社', clubId: null, category: '講座', startsAt: '2030-10-11T01:00:00Z', endsAt: '2030-10-11T03:00:00Z', sourceUrl: 'https://www.ntou.edu.tw/', location: '海大演講廳', description: '測試公告' }
const meetup = { id: 'meetup-qa', ownerId: 'tat-qa', hostName: '海大同學', title: '一起參加科技講座', description: '找同學一起參加', category: '一起參加', location: '海大演講廳', startsAt: '2030-10-11T01:00:00Z', endsAt: '2030-10-11T03:00:00Z', capacity: 4, participantCount: 1, linkedEventId: campus.id, status: 'published' }
await page.route('https://ntou-campus-api.ntou-campus.workers.dev/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: route.request().url().includes('/meetups') ? [meetup] : [campus], total: 1 }) }))
page.on('pageerror', e => errors.push(e.message))
const pass = message => { checks.push(message); console.log('PASS', message) }
const nav = async name => page.locator('.bottom-nav').getByRole('button', { name, exact: true }).click()
try {
  await page.goto('http://127.0.0.1:5317'); await page.locator('input[name=studentId]').fill('QA_ONLY'); await page.locator('input[name=password]').fill('QA_ONLY'); await page.getByRole('button', { name: '登入', exact: true }).click(); await page.locator('.bottom-nav').waitFor()
  await nav('活動'); await page.locator('.meetup-card').waitFor(); await page.locator('.activity-list-item').waitFor()
  assert(await page.locator('.meetups-panel').evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('.activity-list')) & Node.DOCUMENT_POSITION_FOLLOWING)))
  assert.equal(await page.getByRole('link', { name: '開啟活動平台' }).count(), 0)
  pass('Student meetups pinned above announcements; no platform redirect shortcut')
  for (const mode of ['dark', 'light']) {
    if (mode === 'light') { await nav('其他'); await page.getByRole('button', { name: '外觀設定', exact: true }).click(); await page.getByRole('button', { name: '白天模式', exact: true }).click(); await page.getByRole('button', { name: '返回', exact: true }).click(); await nav('活動') }
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: `qa/test10-meetups-${mode}-${width}.png`, animations: 'disabled' })
      await page.getByRole('button', { name: '發起揪團', exact: true }).click()
      await page.locator('dialog[data-campus-meetup][open]').waitFor()
      await page.getByLabel('揪團名稱', { exact: true }).fill('材料力學讀書會')
      await page.getByLabel('介紹', { exact: true }).fill('討論本週課程')
      const bounds = await page.locator('dialog[data-campus-meetup]').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }))
      assert(bounds.scroll <= bounds.width + 1)
      await page.screenshot({ path: `qa/test10-create-${mode}-${width}.png`, animations: 'disabled' })
      await page.getByRole('button', { name: '關閉揪團視窗' }).click()
      sizes.push({ mode, width, noOverflow: true })
    }
  }
  pass('Pinned cards and native form fit 320/390/430px in light and dark')
  await page.getByLabel('搜尋活動').fill('材料力學不存在'); assert.equal(await page.locator('.meetup-card').count(), 0); await page.getByLabel('搜尋活動').fill('科技'); assert.equal(await page.locator('.meetup-card').count(), 1); pass('Search filters student meetups along with announcement content')
  await page.locator('.activity-list-item').click(); await page.getByRole('button', { name: '發起揪團一起參加' }).click(); await page.locator('dialog[data-campus-meetup][open]').waitFor(); assert.equal(await page.getByLabel('揪團名稱', { exact: true }).inputValue(), '一起參加｜海大科技講座'); assert.equal(await page.getByLabel('集合地點').inputValue(), '海大演講廳'); assert.equal(await page.getByRole('link', { name: '活動平台', exact: true }).count(), 0); pass('Announcement starts a linked native meetup, prefilling title/place without leaving TAT')
  await page.getByLabel('介紹', { exact: true }).fill('一起參加'); await page.getByRole('button', { name: '發布揪團', exact: true }).click(); await page.getByRole('alert').waitFor(); assert((await page.getByRole('alert').innerText()).includes('Android')); assert.equal(await page.locator('dialog[data-campus-meetup][open]').count(), 1); pass('Web/mock users cannot claim AIS identity or silently publish')
  await page.getByRole('button', { name: '關閉揪團視窗' }).click(); assert.equal(errors.length, 0)
  writeFileSync('qa/test10-meetups-ui.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks, sizes, errors, mockedPublicData: true, realAisVerified: false }, null, 2))
} finally { await browser.close() }
