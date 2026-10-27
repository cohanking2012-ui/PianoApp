import { micEngine } from '../audio/micEngine'
import { useMicState, useMidiState } from '../input/inputHub'
import { midiInput } from '../input/midiInput'
import { resetProgress } from '../state/progress'
import { DEFAULT_SETTINGS, updateSettings, useSettings, type DetectionSpeed, type InputMode, type NoteNaming, type Theme } from '../state/settings'
import { Icon } from '../ui/icons'
import { href } from '../ui/router'
import { ScreenHeader, Segmented, Toggle } from '../ui/common'

export function SettingsScreen() {
  const s = useSettings()
  const mic = useMicState()
  const midi = useMidiState()

  return (
    <div className="screen">
      <ScreenHeader title="Settings" />

      <section className="card stack">
        <h2>Listening</h2>
        <div className="field">
          <span className="field-label">How the app hears you</span>
          <Segmented<InputMode>
            label="Input"
            value={s.inputMode}
            onChange={(inputMode) => {
              updateSettings({ inputMode })
              if (inputMode === 'midi') midiInput.enable()
            }}
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'mic', label: 'Microphone' },
              { value: 'midi', label: 'MIDI cable' },
            ]}
          />
          <span className="field-help">
            Automatic uses the microphone, or a MIDI keyboard when one is connected. MIDI (USB cable) is the most accurate, but
            iPhones don't support it in the browser.
          </span>
        </div>
        <div className="row small">
          <span className={`pill ${mic.status === 'listening' ? 'good' : ''}`}>
            <span className="dot" /> Microphone: {mic.status === 'listening' ? 'on' : mic.status === 'denied' ? 'blocked' : 'off'}
          </span>
          <span className={`pill ${midi.devices.length ? 'good' : ''}`}>
            <span className="dot" /> MIDI:{' '}
            {midi.status === 'unsupported'
              ? 'not supported here'
              : midi.devices.length
                ? midi.devices.join(', ')
                : midi.status === 'ready'
                  ? 'no keyboard found'
                  : 'not connected'}
          </span>
        </div>
        {midi.status !== 'unsupported' && s.inputMode !== 'mic' && !midi.devices.length && (
          <button className="btn btn-soft" onClick={() => midiInput.enable()}>
            Look for a MIDI keyboard
          </button>
        )}
        {mic.status === 'listening' && (
          <button className="btn" onClick={() => micEngine.stop()}>
            <Icon name="micOff" /> Stop the microphone
          </button>
        )}

        <div className="field">
          <span className="field-label">
            <span>Microphone sensitivity</span>
            <span className="muted">{s.sensitivity}</span>
          </span>
          <input type="range" min={0} max={100} value={s.sensitivity} onChange={(e) => updateSettings({ sensitivity: Number(e.target.value) })} aria-label="Sensitivity" />
          <span className="field-help">
            Higher hears quieter playing but also more background noise. Use <a href={href('play')}>Free Play</a> to test and
            auto-adjust it.
          </span>
        </div>
        <div className="field">
          <span className="field-label">Note detection</span>
          <Segmented<DetectionSpeed>
            label="Detection speed"
            value={s.detectionSpeed}
            onChange={(detectionSpeed) => updateSettings({ detectionSpeed })}
            options={[
              { value: 'fast', label: 'Quick' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'steady', label: 'Careful' },
            ]}
          />
          <span className="field-help">"Careful" waits a little longer before deciding which note it heard: fewer mistakes in noisy rooms.</span>
        </div>
        <Toggle
          checked={s.anyOctave}
          onChange={(anyOctave) => updateSettings({ anyOctave })}
          label="Accept the right note in any octave"
          help="Turn on if the app often hears your notes one octave too high or low."
        />
        <div className="field">
          <span className="field-label">
            <span>Piano tuning (A4)</span>
            <span className="muted">{s.a4} Hz</span>
          </span>
          <input type="range" min={415} max={466} value={s.a4} onChange={(e) => updateSettings({ a4: Number(e.target.value) })} aria-label="A4 tuning" />
          <span className="field-help">Leave at 440 Hz unless your acoustic piano is tuned unusually high or low.</span>
        </div>
      </section>

      <section className="card stack">
        <h2>Display</h2>
        <div className="field">
          <span className="field-label">Theme</span>
          <Segmented<Theme>
            label="Theme"
            value={s.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
        <div className="field">
          <span className="field-label">Note names</span>
          <Segmented<NoteNaming>
            label="Note names"
            value={s.noteNaming}
            onChange={(noteNaming) => updateSettings({ noteNaming })}
            options={[
              { value: 'letters', label: 'C D E' },
              { value: 'solfege', label: 'Do Re Mi' },
            ]}
          />
        </div>
        <Toggle checked={s.showNoteNames} onChange={(showNoteNames) => updateSettings({ showNoteNames })} label="Show note names on notes and keys" />
        <Toggle checked={s.showFingers} onChange={(showFingers) => updateSettings({ showFingers })} label="Show finger numbers" />
      </section>

      <section className="card stack">
        <h2>Sound</h2>
        <Toggle checked={s.keySounds} onChange={(keySounds) => updateSettings({ keySounds })} label="Play a sound when tapping on-screen keys" />
        <Toggle
          checked={s.metronomeInTempoMode}
          onChange={(metronomeInTempoMode) => updateSettings({ metronomeInTempoMode })}
          label="Metronome clicks in “Play in time” mode"
        />
      </section>

      <section className="card stack">
        <h2>Your data</h2>
        <p className="muted small">Progress and settings are saved only on this device. There is no account.</p>
        <button className="btn" onClick={() => updateSettings(DEFAULT_SETTINGS)}>
          Reset settings
        </button>
        <button
          className="btn btn-danger"
          onClick={() => {
            if (confirm('Erase all lesson progress and scores? This cannot be undone.')) resetProgress()
          }}
        >
          <Icon name="trash" /> Erase progress
        </button>
      </section>

      <a className="btn btn-soft" href={href('help')}>
        <Icon name="help" /> Help &amp; tips
      </a>
      <p className="muted small" style={{ textAlign: 'center' }}>
        Piano Coach · works offline · version {__APP_VERSION__}
      </p>
    </div>
  )
}
