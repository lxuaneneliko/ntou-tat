// Local browser checks use synthetic data only, never school credentials.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/lxuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
const checks = [], errors = [], measurements = []
page.on('pageerror', (error) => errors.push(error.message))
const pass = (message) => { checks.push(message); console.log('PASS', message) }
const nav = (name) => page.locator('.bottom-nav').getByText(name, { exact: true }).click()
const menu = async (role, name) => { await page.getByRole('button', { name: '更多操作', exact: true }).click(); await page.getByRole(role, { name, exact: true }).click() }
const screen = (name) => page.screenshot({ path: fileURLToPath(new URL('../qa/' + name + '.png', import.meta.url)), fullPage: true, animations: 'disabled' })
const fits = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
try {
  await page.goto('http://127.0.0.1:5317')
  await page.locator('input[name=studentId]').fill('QA_ONLY'); await page.locator('input[name=password]').fill('QA_ONLY')
  await page.getByRole('button', { name: '登入', exact: true }).click(); await page.locator('.bottom-nav').waitFor()
  await nav('行事曆')
  assert.equal(await page.locator('.calendar-v3-heading, .calendar-v3-controls, .calendar-date-tools, .calendar-options').count(), 0)
  assert.equal(await page.locator('.calendar-course-row, .calendar-event-chip.course').count(), 0)
  for (const [width, height] of [[320, 740], [390, 844], [430, 932], [390, 640]]) {
    await page.setViewportSize({ width, height })
    await page.getByLabel('跳至日期').fill('2026-08-15') // August 2026 needs six rows.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForFunction(() => {
      const grid = document.querySelector('.calendar-grid').getBoundingClientRect(), nav = document.querySelector('.bottom-nav').getBoundingClientRect()
      return grid.bottom <= nav.top - 5
    })
    assert.equal(await page.locator('.calendar-grid .calendar-day').count(), 42)
    const dimensions = await page.evaluate(() => {
      const grid = document.querySelector('.calendar-grid').getBoundingClientRect(), nav = document.querySelector('.bottom-nav').getBoundingClientRect()
      const lastDay = document.querySelector('[aria-label="選取 2026-08-31"]').getBoundingClientRect()
      return { left: grid.left, right: innerWidth - grid.right, bottom: grid.bottom, navTop: nav.top, lastDayBottom: lastDay.bottom }
    })
    assert.ok(dimensions.left >= 12 && dimensions.right >= 12, JSON.stringify(dimensions))
    assert.ok(dimensions.lastDayBottom < dimensions.navTop)
    await fits(); measurements.push({ width, height, ...dimensions })
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByLabel('跳至日期').fill('2026-10-10'); await screen('17-test4-full-month-dark')
  pass('Whole six-row month including day 31 fits above bottom navigation at 320/390/430px, with side padding and no redundant heading')
  await menu('menuitemradio', '週檢視'); assert.equal(await page.locator('.calendar-day').count(), 7)
  await menu('menuitemcheckbox', '學期週次設定'); await page.getByLabel('學期週次').selectOption('1')
  await menu('menuitemcheckbox', '學期週次設定'); assert.equal(await page.locator('.calendar-options').count(), 0)
  await menu('menuitemradio', '月檢視'); assert.equal(await page.locator('.calendar-day').count(), 42)
  pass('Month/week and semester settings remain available in the three-dot menu')
  await page.evaluate(async () => {
    const storage = await import('/src/storage/calendarStorage.ts')
    storage.writePersonalCalendarStore({ '01400000': Array.from({ length: 5 }, (_, i) => ({ id: 'personal-calendar-overflow-' + i, title: '連續申請' + i, startsOn: '2026-10-05', endsOn: '2026-10-11', source: 'personal', category: '個人' })) })
  })
  await page.reload(); await page.locator('.bottom-nav').waitFor(); await nav('行事曆'); await page.getByLabel('跳至日期').fill('2026-10-07')
  const row = page.locator('.calendar-week-row').filter({ has: page.getByLabel('選取 2026-10-07', { exact: true }) })
  const rowHeight = await page.locator('.calendar-grid').evaluate((element) => parseFloat(getComputedStyle(element).getPropertyValue('--month-row-height')))
  const visibleBars = rowHeight >= 92 ? 2 : rowHeight >= 72 ? 1 : 0
  assert.ok(visibleBars >= 1) // The shared bulletin consumes height, not additional calendar rows.
  assert.equal(await row.locator('.calendar-event-span').count(), visibleBars)
  assert.equal(await row.locator('.calendar-event-span').first().evaluate((element) => element.style.gridColumn), '1 / span 7')
  const cell = page.locator('.calendar-day').filter({ has: page.getByLabel('選取 2026-10-07', { exact: true }) })
  assert.equal(await cell.locator('.calendar-more-events').innerText(), '+' + (5 - visibleBars))
  await cell.locator('.calendar-more-events').click()
  assert.equal(await page.locator('.agenda-row').filter({ hasText: '連續申請' }).count(), 5)
  pass('Overlapping continuous bars do not enlarge the month; +N opens all events for the selected day')
  await nav('其他')
  const tools = await page.locator('.tool-list > button > span').allTextContents()
  assert.equal(tools[tools.indexOf('校務公告') + 1], '帳號與設定')
  const cardFits = async () => {
    await page.evaluate(() => window.scrollTo(0, 0))
    const fields = await page.locator('.identity-card-fields > div').evaluateAll((nodes) => nodes.map((node) => { const bounds = node.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, right: bounds.right } }))
    assert.equal(fields.length, 2); assert.ok(Math.abs(fields[0].y - fields[1].y) < 1); assert.ok(fields[0].right <= fields[1].x)
    assert.ok((await page.locator('.tat-identity-card .student-avatar').boundingBox()).width >= 80); await fits()
    assert.equal((await page.getByRole('button', { name: '更換頭像', exact: true }).boundingBox()).height, 88)
  }
  for (const width of [320, 390, 430]) { await page.setViewportSize({ width, height: 844 }); await cardFits() }
  await page.setViewportSize({ width: 390, height: 844 }); await screen('18-test4-profile-dark')
  await page.getByRole('button', { name: '帳號與設定', exact: true }).click()
  assert.equal(await page.locator('.widget-lock-help').getAttribute('open'), null)
  assert.doesNotMatch(await page.locator('.appearance-settings, .widget-settings').allInnerTexts().then((text) => text.join(' ')), /TAT 已開放|調整後會使用|被替換的功能會移入/)
  await page.getByRole('button', { name: '白天模式', exact: true }).click(); await screen('19-test4-settings-light')
  await page.getByRole('button', { name: '返回', exact: true }).click(); await cardFits(); await screen('20-test4-profile-light')
  pass('Settings is directly below announcements, descriptions are concise, and larger avatar plus side-by-side fields fit both themes')
  await nav('成績'); await page.getByRole('button', { name: '更多操作', exact: true }).click()
  assert.equal(await page.getByRole('menuitem', { name: '進階英文抵免設定', exact: true }).count(), 0)
  await page.getByRole('menuitem', { name: '畢業門檻分析', exact: true }).click()
  const selector = page.getByLabel('進階英文狀態'); await selector.waitFor()
  assert.equal(await selector.count(), 1); assert.equal(await page.locator('.advanced-english-picker').count(), 0)
  assert.match(await selector.locator('xpath=ancestor::article').innerText(), /進階英文|外文領域/)
  await selector.selectOption('completed')
  assert.match(await selector.locator('xpath=ancestor::article').innerText(), /已達成/)
  await selector.scrollIntoViewIfNeeded(); await screen('21-test4-existing-english-row')
  await page.getByRole('button', { name: '關閉畢業門檻分析' }).click(); await menu('menuitem', '畢業門檻分析')
  assert.equal(await page.getByLabel('進階英文狀態').inputValue(), 'completed')
  await page.getByLabel('進階英文狀態').selectOption('eligible')
  assert.match(await page.getByLabel('進階英文狀態').locator('xpath=ancestor::article').innerText(), /尚缺/)
  await page.getByRole('button', { name: '關閉畢業門檻分析' }).click()
  pass('Completed and approved-exemption options live in the existing English row, persist, and keep eligibility distinct from completed credit')
  await nav('行事曆'); await page.getByLabel('跳至日期').fill('2026-10-10'); await page.evaluate(() => window.scrollTo(0, 0)); await screen('22-test4-full-month-light')
  assert.deepEqual(errors, [])
  writeFileSync(new URL('../qa/test4-results.json', import.meta.url), JSON.stringify({ checks, errors, measurements, mockOnly: true }, null, 2))
} finally { await browser.close() }
