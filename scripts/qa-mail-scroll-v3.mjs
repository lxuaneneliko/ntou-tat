import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/lxuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const checks = []
const pass = (value) => { checks.push(value); console.log('PASS', value) }
const row = (uid) => page.locator(`[data-mail-uid="${uid}"]`)
const position = (uid) => page.evaluate((target) => ({
  y: window.scrollY,
  rowTop: document.querySelector(`[data-mail-uid="${target}"]`).getBoundingClientRect().top,
}), uid)
const alignRow = async (uid, offset = 130) => {
  await row(uid).waitFor()
  await page.evaluate(({ target, offset }) => {
    const bounds = document.querySelector(`[data-mail-uid="${target}"]`).getBoundingClientRect()
    window.scrollTo({ top: window.scrollY + bounds.top - offset, behavior: 'instant' })
  }, { target: uid, offset })
  await page.waitForTimeout(40)
}
const expectPosition = async (uid, before) => {
  await row(uid).waitFor()
  await page.waitForTimeout(80)
  const after = await position(uid)
  assert.ok(Math.abs(after.rowTop - before.rowTop) < 2, `${uid}: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`)
  return after
}

try {
  await page.goto('http://127.0.0.1:5317')
  await page.locator('input[name=studentId]').fill('QA_ONLY')
  await page.locator('input[name=password]').fill('QA_ONLY')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.locator('.bottom-nav').waitFor()
  await page.evaluate(async () => {
    const { mailApi } = await import('/src/api/mail.ts')
    window.qaMailbox = Array.from({ length: 240 }, (_, i) => ({
      uid: String(240 - i), subject: 'QA信件' + (240 - i), sender: 'QA測試', senderAddress: 'qa@example.com',
      receivedAt: new Date(Date.UTC(2026, 9, 10, 0, 240 - i)).toISOString(), unread: true, starred: false,
    }))
    mailApi.listFolders = async () => ({ folders: [
      { id: 'INBOX', name: '收件匣', kind: 'inbox', total: 240, unread: 240 },
      { id: 'Archive', name: '封存', kind: 'archive', total: 15, unread: 0 },
    ] })
    mailApi.listMessages = async (credentials, folder, offset = 0, limit = 30) => {
      if (offset) await new Promise((resolve) => setTimeout(resolve, 180))
      const messages = folder === 'Archive' ? window.qaMailbox.slice(0, 15) : window.qaMailbox
      return { account: credentials.account, folder, uidValidity: 'QA1', total: messages.length, unread: messages.length,
        offset, nextOffset: offset + Math.min(limit, messages.length - offset), hasMore: offset + limit < messages.length,
        messages: messages.slice(offset, offset + limit) }
    }
    window.qaDetail = (uid) => ({ ...window.qaMailbox.find((item) => item.uid === uid),
      body: 'QA內文\n' + Array.from({ length: 90 }, (_, index) => `信件內容第${index + 1}行`).join('\n'),
      bodyImages: [], bodyBlocks: [], recipients: [], cc: [], replyTo: [], messageId: 'QA', references: '', attachments: [],
    })
    mailApi.getMessage = async (_, __, uid) => window.qaDetail(uid)
    mailApi.setFlag = async () => {}
    mailApi.moveMessage = async (_, __, uid) => { window.qaMailbox = window.qaMailbox.filter((message) => message.uid !== uid) }
  })
  await page.locator('.bottom-nav').getByText('信箱', { exact: true }).click()
  await page.locator('.mail-login-form input[type=password]').fill('QA_ONLY')
  await page.getByRole('button', { name: '登入信箱', exact: true }).click()
  await row('220').waitFor()
  await alignRow('220')
  const syncingBefore = await position('220')
  await row('220').locator('.mail-message-open').click()
  await page.locator('.mail-detail-screen').waitFor()
  assert.ok(await page.evaluate(() => window.scrollY < 2), 'Opened mail must begin at the top')
  await page.evaluate(() => window.scrollTo(0, 1200))
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '返回信箱', exact: true }).click()
  const syncingAfter = await expectPosition('220', syncingBefore)
  assert.ok(!(await row('220').getAttribute('class')).includes('unread'))
  pass('Return preserves UID and viewport offset after reading a long mail, unread changes, and background cache completion')

  for (let batch = 0; batch < 10 && await page.locator('.mail-message-row').count() < 240; batch++) {
    await page.locator('.mail-scroll-sentinel').scrollIntoViewIfNeeded()
    await page.waitForTimeout(100)
  }
  await page.waitForFunction(() => document.querySelectorAll('.mail-message-row').length === 240)
  await alignRow('31')
  const deepBefore = await position('31')
  assert.ok(deepBefore.y > 10000)
  await row('31').locator('.mail-message-open').click()
  await page.locator('.mail-detail-screen').waitFor()
  await page.getByRole('button', { name: '標示未讀', exact: true }).click()
  const deepAfter = await expectPosition('31', deepBefore)
  assert.ok((await row('31').getAttribute('class')).includes('unread'))
  pass('Infinite-loaded deep rows keep their original scroll position when marking a mail unread')

  const headerBottom = await page.evaluate(() => Math.max(0, document.querySelector('.app-header').getBoundingClientRect().bottom))
  await alignRow('31', headerBottom)
  const neighborBefore = await position('30')
  await row('31').locator('.mail-message-open').click()
  await page.locator('.mail-detail-screen').waitFor()
  await page.getByLabel('移動郵件').selectOption('Archive')
  await expectPosition('30', neighborBefore)
  assert.equal(await row('31').count(), 0)
  pass('Moving the opened mail preserves a neighboring UID anchor instead of jumping or leaving a blank gap')

  await page.getByLabel('搜尋已載入郵件').fill('QA信件1')
  await alignRow('150')
  const searchBefore = await position('150')
  await row('150').locator('.mail-message-open').click()
  await page.locator('.mail-detail-screen').waitFor()
  await page.getByRole('button', { name: '返回信箱', exact: true }).click()
  await expectPosition('150', searchBefore)
  assert.equal(await page.getByLabel('搜尋已載入郵件').inputValue(), 'QA信件1')
  pass('Filtered mailbox keeps the search and its own scroll offset after returning from mail detail')

  await page.evaluate(async () => {
    const { mailApi } = await import('/src/api/mail.ts')
    mailApi.getMessage = async () => { throw new Error('QA模擬離線') }
  })
  await alignRow('150')
  const offlineBefore = await position('150')
  await row('150').locator('.mail-message-open').click()
  await page.getByText('目前無法連線，顯示已儲存的信件內文', { exact: true }).waitFor({ state: 'hidden' }).catch(() => {})
  await page.locator('.mail-detail-screen').waitFor()
  await page.waitForTimeout(80)
  await page.getByRole('button', { name: '返回信箱', exact: true }).click()
  await expectPosition('150', offlineBefore)
  pass('Offline cached mail return compensates for a newly displayed notice and preserves the row location')

  await page.evaluate(async () => {
    const { mailApi } = await import('/src/api/mail.ts')
    mailApi.getMessage = (_, __, uid) => new Promise((resolve) => { window.qaResolveDetail = () => resolve(window.qaDetail(uid)) })
  })
  await alignRow('150')
  const cachedBefore = await position('150')
  await row('150').locator('.mail-message-open').click()
  await page.locator('.mail-detail-screen').waitFor()
  await page.waitForFunction(() => typeof window.qaResolveDetail === 'function')
  await page.getByRole('button', { name: '返回信箱', exact: true }).click()
  await expectPosition('150', cachedBefore)
  await page.evaluate(() => window.qaResolveDetail())
  await page.waitForTimeout(180)
  assert.equal(await page.locator('.mail-detail-screen').count(), 0)
  await expectPosition('150', cachedBefore)
  pass('Late online refresh cannot reopen a cached message after the user has already returned to the list')

  await alignRow('150')
  const composeBefore = await position('150')
  await page.locator('.mail-compose-fab').evaluate((button) => button.click())
  await page.getByLabel('關閉撰寫').click()
  await expectPosition('150', composeBefore)
  pass('Closing a new draft returns to the same mailbox position')

  await page.getByLabel('郵件資料夾').selectOption('Archive')
  await page.waitForFunction(() => document.querySelectorAll('.mail-message-row').length === 15)
  assert.ok(await page.evaluate(() => window.scrollY < 2))
  pass('Changing folders does not leak the previous folder/search position')

  writeFileSync(new URL('../qa/mail-scroll-results.json', import.meta.url), JSON.stringify({ checks, mockOnly: true, positions: { syncingBefore, syncingAfter, deepBefore, deepAfter } }, null, 2))
} catch (error) {
  console.log((await page.locator('body').innerText()).slice(0, 1200))
  throw error
} finally {
  await browser.close()
}
