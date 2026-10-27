// End-to-end check of the built app in Chromium, with a fake microphone.
//
//   npm run build && npm run e2e
//
// A WAV file of synthetic piano notes is fed to Chromium as the microphone
// input, so this exercises the real Web Audio → pitch detection → lesson path.
// Screenshots are written to test-results/.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const OUT = resolve('test-results')
mkdirSync(OUT, { recursive: true })

// ---------- synthetic piano audio ----------
function wav(notes, seconds, sampleRate = 48000) {
  const n = Math.floor(seconds * sampleRate)
  const data = new Float32Array(n)
  const harmonics = [1, 0.7, 0.45, 0.3, 0.2, 0.12]
  for (const { midi, start, dur } of notes) {
    const f0 = 440 * Math.pow(2, (midi - 69) / 12)
    const s0 = Math.floor(start * sampleRate)
    for (let i = s0; i < n; i++) {
      const t = (i - s0) / sampleRate
      let env = Math.min(1, t / 0.005) * Math.exp(-t * 1.5)
      if (t > dur) env *= Math.exp(-(t - dur) * 25)
      if (t > dur + 0.4) break
      let s = 0
      harmonics.forEach((h, k) => (s += h * Math.sin(2 * Math.PI * f0 * (k + 1) * t + k) * Math.exp(-t * k * 0.6)))
      data[i] += 0.12 * env * s
    }
  }
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(data[i] * 32767))), 44 + i * 2)
  return buf
}
// Middle C struck every 0.8 s (the file loops forever).
const wavPath = resolve(OUT, 'middle-c.wav')
writeFileSync(wavPath, wav([0, 1, 2, 3].map((i) => ({ midi: 60, start: 0.1 + i * 0.8, dur: 0.6 })), 3.2))

// ---------- server ----------
const PORT = 4179
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('preview server did not start')), 20000)
  server.stdout.on('data', (d) => d.toString().includes(String(PORT)) && (clearTimeout(t), ok()))
})
const BASE = `http://localhost:${PORT}/`

const failures = []
const check = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) failures.push(msg)
}

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wavPath}`, '--autoplay-policy=no-user-gesture-required'],
})

async function newPage(viewport, colorScheme = 'light') {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme, permissions: ['microphone'] })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return { page, errors, context }
}

try {
  const portrait = { width: 390, height: 844 }
  const { page, errors, context } = await newPage(portrait)

  // Every screen renders without errors.
  for (const [route, text] of [
    ['', 'Piano Coach'],
    ['#/play', 'Free Play'],
    ['#/practice', 'Practice tools'],
    ['#/practice/metronome', 'Metronome'],
    ['#/practice/quiz', 'Note quiz'],
    ['#/practice/keyboard', 'Keyboard guide'],
    ['#/settings', 'Settings'],
    ['#/help', 'Help'],
    ['#/lesson/ode-to-joy', 'Ode to Joy'],
  ]) {
    await page.goto(BASE + route)
    await page.getByText(text, { exact: false }).first().waitFor({ timeout: 5000 })
    const name = route.replace(/[#/]+/g, '-').replace(/^-|-$/g, '') || 'home'
    await page.screenshot({ path: `${OUT}/${name}.png` })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    check(!overflow, `no horizontal scrolling on ${route || 'home'}`)
  }

  // Free play: start the mic and hear middle C from the fake microphone.
  await page.goto(BASE + '#/play')
  await page.getByRole('button', { name: 'Tap to start listening', exact: true }).click()
  await page.getByText('Listening', { exact: true }).first().waitFor({ timeout: 5000 })
  await page.locator('.history span', { hasText: 'C4' }).first().waitFor({ timeout: 8000 })
  check(true, 'free play hears C4 from the microphone')
  await page.screenshot({ path: `${OUT}/play-listening.png` })

  // Lesson 1 in wait mode completes using only the microphone.
  await page.goto(BASE + '#/lesson/middle-c')
  await page.getByRole('dialog').getByRole('button', { name: /^start$/i }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/lesson-playing.png` })
  await page.getByText('Lesson complete', { exact: false }).or(page.getByText('Well done', { exact: false })).or(page.getByText('Brilliant', { exact: false })).first().waitFor({ timeout: 15000 })
  const pct = await page.locator('.result-big').innerText()
  check(pct.trim() === '100%', `middle C lesson finished with ${pct.trim()} accuracy`)
  await page.screenshot({ path: `${OUT}/lesson-results.png` })

  // Progress was saved.
  await page.goto(BASE)
  await page.waitForTimeout(300)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pianoCoach.progress') || '{}'))
  check(saved['middle-c']?.completed === true, 'progress saved to the device')

  // Tempo mode with on-screen taps: the timing session runs and ends with a score.
  await page.goto(BASE + '#/lesson/hot-cross-buns')
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: 'Play in time' }).click()
  await dlg.getByRole('button', { name: /^start$/i }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/lesson-tempo.png` })
  await page.getByText('Lesson complete', { exact: false }).or(page.getByText('Well done', { exact: false })).or(page.getByText('Brilliant', { exact: false })).first().waitFor({ timeout: 25000 })
  check(true, 'tempo mode runs to the end and shows a score')

  // Wrong-note feedback: tap a wrong key on screen.
  await page.goto(BASE + '#/lesson/c-d-e')
  await page.getByRole('dialog').getByRole('button', { name: /^start$/i }).click()
  await page.waitForTimeout(300)
  // Middle C from the mic will arrive too; tap G4 which is never right in this lesson.
  await page.locator('.key[aria-label="G4"]').dispatchEvent('pointerdown')
  await page.locator('.player-feedback.bad').first().waitFor({ timeout: 3000 })
  check((await page.locator('.player-feedback').innerText()).includes('You played G4'), 'wrong note shows "You played G4"')
  await page.screenshot({ path: `${OUT}/lesson-wrong.png` })

  // Offline: the service worker serves the app with the network off.
  await page.goto(BASE)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForTimeout(500)
  await context.setOffline(true)
  await page.reload()
  await page.getByText('Piano Coach').first().waitFor({ timeout: 5000 })
  await page.goto(BASE + '#/lesson/ode-to-joy')
  await page.getByText('Ode to Joy').first().waitFor({ timeout: 5000 })
  check(true, 'app loads offline')
  await context.setOffline(false)

  const relevant = errors.filter((e) => !/favicon|DevTools|Download the React/.test(e))
  check(relevant.length === 0, `no console errors or warnings${relevant.length ? ':\n  ' + relevant.join('\n  ') : ''}`)
  await context.close()

  // Dark mode + landscape screenshots.
  const dark = await newPage(portrait, 'dark')
  await dark.page.goto(BASE)
  await dark.page.screenshot({ path: `${OUT}/home-dark.png` })
  await dark.page.goto(BASE + '#/lesson/fur-elise')
  await dark.page.getByRole('dialog').waitFor()
  await dark.page.waitForTimeout(400)
  await dark.page.screenshot({ path: `${OUT}/lesson-sheet-dark.png` })
  await dark.page.keyboard.press('Escape')
  await dark.page.waitForTimeout(400)
  await dark.page.screenshot({ path: `${OUT}/lesson-dark.png` })
  await dark.context.close()

  const land = await newPage({ width: 844, height: 390 })
  await land.page.goto(BASE + '#/lesson/fur-elise')
  await land.page.getByRole('dialog').waitFor()
  await land.page.screenshot({ path: `${OUT}/lesson-sheet-landscape.png` })
  await land.page.keyboard.press('Escape')
  await land.page.waitForTimeout(300)
  await land.page.screenshot({ path: `${OUT}/lesson-landscape.png` })
  const fits = await land.page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1)
  check(fits, 'lesson fits a landscape phone screen without scrolling')
  await land.page.goto(BASE + '#/play')
  await land.page.screenshot({ path: `${OUT}/play-landscape.png` })
  await land.context.close()
} catch (e) {
  failures.push(String(e?.stack || e))
  console.error(e)
} finally {
  await browser.close()
  server.kill()
}

console.log(failures.length ? `\n${failures.length} problem(s) found` : '\nAll end-to-end checks passed')
process.exit(failures.length ? 1 : 0)
