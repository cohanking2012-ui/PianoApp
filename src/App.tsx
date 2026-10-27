import { useEffect, useState } from 'react'
import { FreePlayScreen } from './screens/FreePlayScreen'
import { HelpScreen } from './screens/HelpScreen'
import { HomeScreen } from './screens/HomeScreen'
import { KeyboardRefScreen } from './screens/KeyboardRefScreen'
import { LessonScreen } from './screens/LessonScreen'
import { MetronomeScreen } from './screens/MetronomeScreen'
import { PracticeScreen } from './screens/PracticeScreen'
import { QuizScreen } from './screens/QuizScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SongsScreen } from './screens/SongsScreen'
import { useSettings } from './state/settings'
import { Icon, type IconName } from './ui/icons'
import { href, useRoute } from './ui/router'
import { onUpdateReady, applyUpdate } from './sw-register'

const TABS: { path: string; icon: IconName; label: string }[] = [
  { path: '', icon: 'learn', label: 'Learn' },
  { path: 'songs', icon: 'songs', label: 'Songs' },
  { path: 'play', icon: 'mic', label: 'Free Play' },
  { path: 'practice', icon: 'metronome', label: 'Practice' },
  { path: 'settings', icon: 'settings', label: 'Settings' },
]

function Screen({ route }: { route: string[] }) {
  const [first, second] = route
  switch (first) {
    case 'lesson':
      return <LessonScreen songId={second ?? ''} />
    case 'songs':
      return <SongsScreen />
    case 'play':
      return <FreePlayScreen />
    case 'practice':
      if (second === 'metronome') return <MetronomeScreen />
      if (second === 'quiz') return <QuizScreen />
      if (second === 'keyboard') return <KeyboardRefScreen />
      return <PracticeScreen />
    case 'settings':
      return <SettingsScreen />
    case 'help':
      return <HelpScreen />
    default:
      return <HomeScreen />
  }
}

export function App() {
  const route = useRoute()
  const { theme } = useSettings()
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0f1118' : '#f5f6fb'))
  }, [theme])

  useEffect(() => onUpdateReady(() => setUpdateReady(true)), [])

  const inLesson = route[0] === 'lesson'
  const tab = route[0] === 'help' ? 'practice' : (route[0] ?? '')

  return (
    <div className="app">
      <Screen route={route} />
      {!inLesson && (
        <div className="bottom-nav">
          <nav aria-label="Main">
            {TABS.map((t) => (
              <a key={t.path} href={href(...(t.path ? [t.path] : []))} aria-current={tab === t.path ? 'page' : undefined}>
                <Icon name={t.icon} />
                {t.label}
              </a>
            ))}
          </nav>
        </div>
      )}
      {updateReady && !inLesson && (
        <div className="toast" role="status">
          <span>A new version is ready.</span>
          <button className="btn btn-primary" onClick={applyUpdate}>
            Update
          </button>
        </div>
      )}
    </div>
  )
}
