import { defineConfig, type Plugin, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Lists every file in a directory tree, as forward-slash relative paths. */
function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? listFiles(full, root) : [relative(root, full).split('\\').join('/')]
  })
}

/**
 * Generates dist/sw.js with a precache list of every built file, so the app
 * works offline after the first visit. The cache name changes whenever any
 * file changes, which makes the browser pick up new versions.
 */
function serviceWorker(): Plugin {
  return {
    name: 'piano-coach-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = new Set<string>(['./'])
      const hash = createHash('sha256')
      for (const [fileName, item] of Object.entries(bundle)) {
        files.add(fileName)
        hash.update(fileName)
        hash.update(item.type === 'chunk' ? item.code : item.source)
      }
      for (const file of listFiles('public')) {
        files.add(file)
        hash.update(file)
        hash.update(readFileSync(join('public', file)))
      }
      const template = readFileSync('sw/sw-template.js', 'utf8')
      const source = template
        .replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE_FILES__', JSON.stringify([...files].sort(), null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [react(), serviceWorker()]
  // `npm run dev:phone` serves over HTTPS on the local network so a phone can use the microphone.
  if (mode === 'phone') plugins.push(basicSsl())
  return {
    // Relative base so the same build works on GitHub Pages (/PianoApp/), any other host, or locally.
    base: './',
    plugins,
    define: {
      __APP_VERSION__: JSON.stringify(`${JSON.parse(readFileSync('package.json', 'utf8')).version} (${new Date().toISOString().slice(0, 10)})`),
    },
    build: { target: 'es2020', sourcemap: false },
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  }
})
