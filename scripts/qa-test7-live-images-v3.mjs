// No external writes or real school account; verify current public assets.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/lxuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
const errors = [], imageRequests = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('request', (request) => { if (request.url().startsWith('https://ntou-campus.vercel.app/media/')) imageRequests.push({ url: request.url(), headers: request.headers() }) })
const loaded = (selector) => page.waitForFunction((selector) => { const img = document.querySelector(selector); return img && img.complete && img.naturalWidth > 0 }, selector)
try {
  await page.goto('http://127.0.0.1:5317'); await page.locator('input[name=studentId]').fill('QA_ONLY'); await page.locator('input[name=password]').fill('QA_ONLY')
  await page.getByRole('button', { name: '登入', exact: true }).click(); await page.locator('.bottom-nav').waitFor()
  await page.locator('.bottom-nav').getByRole('button', { name: '活動', exact: true }).click(); await page.locator('.activity-list-item').first().waitFor()
  await loaded('.activity-list-item img[src$="watercolor-exhibition.jpg"]')
  await page.screenshot({ path: fileURLToPath(new URL('../qa/35-test7-live-poster-activities.png', import.meta.url)), animations: 'disabled' })
  const coverage = await page.evaluate(async () => {
    const { readBulletinCache } = await import('/src/campusBulletinData.ts'), { activityImage } = await import('/src/campusActivityMedia.ts')
    const items = readBulletinCache(localStorage)
    return { total: items.length, images: items.flatMap((item) => { const image = activityImage(item); return image ? [{ id: item.id, title: item.title, sourceUrl: item.sourceUrl, imageUrl: image.url }] : [] }) }
  })
  const uniqueUrls = [...new Set(coverage.images.map((item) => item.imageUrl))]
  const assets = await Promise.all(uniqueUrls.map(async (url) => { const response = await page.request.head(url); return { url, status: response.status(), type: response.headers()['content-type'], cors: response.headers()['access-control-allow-origin'] } }))
  const available = assets.filter((asset) => asset.status === 200 && asset.type?.startsWith('image/'))
  const unavailable = assets.filter((asset) => asset.status === 404 || asset.status === 200 && asset.type?.startsWith('text/html'))
  assert.ok(available.length > 0); assert.equal(available.length + unavailable.length, assets.length)
  assert.ok(available.every((asset) => asset.cors === '*'))
  for (const asset of unavailable) {
    const event = coverage.images.find((item) => item.imageUrl === asset.url)
    await page.getByRole('searchbox', { name: '搜尋活動' }).fill(event.title)
    const item = page.locator('.activity-list-item').filter({ has: page.getByText(event.title, { exact: true }) })
    await item.waitFor(); await item.locator('.activity-poster').waitFor({ state: 'detached' })
  }
  await page.getByRole('searchbox', { name: '搜尋活動' }).fill('')
  await page.getByRole('button', { name: '社團', exact: true }).click(); await loaded('.activity-list-item img[src$="ig-DdT2xNbzsOF.webp"]')
  await page.locator('.activity-list-item').first().click(); await loaded('.campus-bulletin-dialog img')
  const originalLink = await page.getByRole('link', { name: '原始公告', exact: true }).getAttribute('href')
  assert.ok(originalLink.includes('instagram.com'))
  await page.screenshot({ path: fileURLToPath(new URL('../qa/36-test7-live-ig-image-detail.png', import.meta.url)), animations: 'disabled' })
  assert.ok(imageRequests.every((request) => !request.headers.cookie && !request.headers.authorization && !request.headers.referer))
  assert.deepEqual(errors, [])
  writeFileSync(new URL('../qa/test7-live-images-results.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), coverage, assets, availableUniqueImages: available.length, unavailableUniqueImages: unavailable.length, imageRequests, originalLink, errors, aisMockOnly: true, publicWrites: false }, null, 2))
  console.log('PASS Live activity feed and original images:', coverage.total, 'events;', available.length, 'available unique images;', unavailable.length, 'unavailable covers safely omitted')
} catch (error) { await page.screenshot({ path: fileURLToPath(new URL('../qa/test7-live-failure.png', import.meta.url)) }); throw error } finally { await browser.close() }
