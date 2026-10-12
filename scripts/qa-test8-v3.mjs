// Mock AIS only. Check edge-to-edge bulletin and cohort-specific English credits.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/lxuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const checks = [], measurements = [], errors = []
const fixtures = [1, 2, 3].map((n) => ({ id: `qa-campus-${n}`, title: `活動${n}：海大學生一起參加科技講座與實作工作坊，這是用來確認長標題仍維持單行的測試`, organizer: '創客社', clubId: 'maker', category: '社課', startsAt: '2030-10-11T16:00:00Z', endsAt: '2030-10-18T16:00:00Z', datePrecision: 'date', sourceUrl: 'https://www.ntou.edu.tw/', description: '詳情與報名' }))
await page.route('https://ntou-campus-api.ntou-campus.workers.dev/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: fixtures, total: 3 }) }))
page.on('pageerror', (e) => errors.push(e.message))
const pass = (text) => { checks.push(text); console.log('PASS', text) }
const screen = (name) => page.screenshot({ path: fileURLToPath(new URL(`../qa/${name}.png`, import.meta.url)), animations: 'disabled' })
const nav = async (name) => {
  if (!await page.locator('.bottom-nav').isVisible()) await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.locator('.bottom-nav').getByRole('button', { name, exact: true }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
}
const settings = async () => { await nav('其他'); await page.getByRole('button', { name: '帳號與設定', exact: true }).click() }
try {
  await page.goto('http://127.0.0.1:5317')
  await page.locator('input[name=studentId]').fill('QA_ONLY'); await page.locator('input[name=password]').fill('QA_ONLY')
  await page.getByRole('button', { name: '登入', exact: true }).click(); await page.locator('.bottom-nav').waitFor()
  await page.waitForFunction(() => document.querySelector('.campus-bulletin-headline')?.textContent?.includes('｜'))
  for (const mode of ['dark', 'light']) {
    if (mode === 'light') { await settings(); await page.getByRole('button', { name: '白天模式', exact: true }).click(); await page.getByRole('button', { name: '返回', exact: true }).click() }
    for (const [width, height] of [[320, 740], [390, 844], [430, 932], [768, 1024]]) {
      await page.setViewportSize({ width, height })
      for (const name of ['課表', '活動', '成績', '信箱', '其他', '行事曆', '校務公告', '帳號與設定']) {
        if (['行事曆', '校務公告', '帳號與設定'].includes(name)) { await nav('其他'); await page.getByRole('button', { name, exact: true }).click() }
        else await nav(name)
        await page.evaluate(() => window.scrollTo(0, 0))
        const m = await page.locator('.campus-bulletin').evaluate((el) => {
          const rect = el.getBoundingClientRect(), shell = document.querySelector('.app-shell'), bounds = shell.getBoundingClientRect(), style = getComputedStyle(el), shellStyle = getComputedStyle(shell)
          const headline = el.querySelector('.campus-bulletin-headline'), titleStyle = getComputedStyle(headline)
          return { height: rect.height, leftGap: rect.left - bounds.left - parseFloat(shellStyle.borderLeftWidth), rightGap: bounds.right - parseFloat(shellStyle.borderRightWidth) - rect.right, border: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth], radius: style.borderRadius, margin: [style.marginLeft, style.marginRight], headlineHeight: headline.getBoundingClientRect().height, nowrap: titleStyle.whiteSpace, ellipsis: titleStyle.textOverflow, nextWidth: el.querySelector('.campus-bulletin-control').getBoundingClientRect().width, overflow: document.documentElement.scrollWidth > innerWidth + 1 }
        })
        assert.equal(m.height, 50); assert.ok(Math.abs(m.leftGap) < .5 && Math.abs(m.rightGap) < .5, JSON.stringify(m))
        assert.deepEqual(m.border, ['0px', '0px', '0px', '0px']); assert.equal(m.radius, '0px'); assert.deepEqual(m.margin, ['0px', '0px'])
        assert.equal(m.headlineHeight, 18); assert.equal(m.nowrap, 'nowrap'); assert.equal(m.ellipsis, 'ellipsis'); assert.equal(m.nextWidth, 44); assert.equal(m.overflow, false)
        assert.equal(await page.locator('.campus-bulletin button').count(), 2)
        measurements.push({ mode, width, page: name, ...m })
      }
    }
    await page.setViewportSize({ width: 390, height: 844 }); await nav('課表'); await screen(`35-test8-edge-bulletin-${mode}`)
  }
  pass('Borderless 50px bulletin fills the app width on eight pages, four widths, and both themes; long headlines stay single-line')
  await page.locator('.campus-bulletin-open').click(); await page.locator('.campus-bulletin-dialog').waitFor(); await page.keyboard.press('Escape')
  const old = await page.locator('.campus-bulletin-headline').innerText(); await page.getByRole('button', { name: '下一則校園快報', exact: true }).click(); assert.notEqual(await page.locator('.campus-bulletin-headline').innerText(), old)
  pass('Activity detail and next controls remain usable without a card, counter, or pause button')

  await nav('成績'); await page.getByRole('button', { name: '更多操作', exact: true }).click(); await page.getByRole('menuitem', { name: '畢業門檻分析', exact: true }).click()
  const year = page.getByLabel('畢業門檻入學年度'), selector = page.getByLabel('進階英文狀態'), total = page.locator('.graduation-audit-ring strong')
  await year.selectOption('115'); await selector.waitFor(); await selector.selectOption('unconfirmed')
  const base115 = Number(await total.innerText())
  await selector.selectOption('approved-exemption')
  assert.equal(Number(await total.innerText()), base115)
  const row = selector.locator('xpath=ancestor::article')
  assert.match(await row.innerText(), /已免修[\s\S]*不計學分/); assert.doesNotMatch(await row.locator('.graduation-audit-rule-main').innerText(), /2\/2/)
  assert.equal(await row.locator('details').count(), 0); assert.equal(await selector.locator('option[value="approved-exemption"]').innerText(), '已核准免修')
  await selector.scrollIntoViewIfNeeded(); await screen('36-test8-english-waiver-115')
  await page.getByRole('button', { name: '關閉畢業門檻分析', exact: true }).click()
  await page.getByRole('button', { name: '更多操作', exact: true }).click(); await page.getByRole('menuitem', { name: '畢業門檻分析', exact: true }).click()
  assert.equal(await selector.inputValue(), 'approved-exemption'); assert.equal(Number(await total.innerText()), base115)
  await selector.selectOption('eligible'); assert.equal(Number(await total.innerText()), base115); assert.match(await row.innerText(), /尚缺/)
  await year.selectOption('114'); await selector.waitFor(); await selector.selectOption('unconfirmed')
  const base114 = Number(await total.innerText())
  await selector.selectOption('approved-exemption'); assert.equal(Number(await total.innerText()), base114 + 2)
  assert.equal(await selector.locator('option[value="approved-exemption"]').innerText(), '已核准抵免'); assert.match(await row.innerText(), /已達成/)
  await selector.scrollIntoViewIfNeeded(); await screen('37-test8-english-transfer-114')
  await year.selectOption('115'); assert.equal(await selector.inputValue(), 'eligible'); assert.equal(Number(await total.innerText()), base115)
  pass('115 waiver adds no credits and persists; 114 approved transfer adds two credits; eligibility and per-cohort choices remain separate')
  assert.deepEqual(errors, [])
  writeFileSync(new URL('../qa/test8-ui-results.json', import.meta.url), JSON.stringify({ checks, measurements, errors, mockOnly: true }, null, 2))
} catch (e) { await screen('test8-failure'); throw e } finally { await browser.close() }
