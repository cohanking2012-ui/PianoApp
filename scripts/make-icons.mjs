// Renders public/favicon.svg into the PNG icons the PWA manifest and iOS need.
// Usage: node scripts/make-icons.mjs   (uses the Playwright-bundled Chromium)
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const svg = readFileSync('public/favicon.svg', 'utf8')
// Full-bleed square version (no rounded corners) for iOS and maskable icons.
const square = svg.replace('rx="112"', 'rx="0"')
const maskable = square.replace('<g transform="translate(96 150)">', '<g transform="translate(256 256) scale(0.78) translate(-256 -256)"><g transform="translate(96 150)">').replace('</svg>', '</g></svg>')

const jobs = [
  { file: 'public/icons/icon-192.png', size: 192, svg },
  { file: 'public/icons/icon-512.png', size: 512, svg },
  { file: 'public/icons/apple-touch-icon.png', size: 180, svg: square },
  { file: 'public/icons/icon-maskable-512.png', size: 512, svg: maskable },
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const job of jobs) {
  await page.setViewportSize({ width: job.size, height: job.size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${job.svg.replace('<svg ', `<svg width="${job.size}" height="${job.size}" `)}</body></html>`)
  await page.screenshot({ path: job.file, omitBackground: true, clip: { x: 0, y: 0, width: job.size, height: job.size } })
  console.log('wrote', job.file)
}
await browser.close()
