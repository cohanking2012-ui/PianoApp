import { micEngine } from '../audio/micEngine'
import { startListening, useInputReady, useMicState, useMidiState, midiActive } from '../input/inputHub'
import { midiInput } from '../input/midiInput'
import { updateSettings, useSettings } from '../state/settings'
import { Icon } from './icons'

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function DeniedHelp() {
  return (
    <div className="help-box">
      <strong>How to allow the microphone</strong>
      {isIOS() ? (
        <ol>
          <li>Open the iPhone <b>Settings</b> app.</li>
          <li>Scroll down and tap <b>Apps</b> → <b>Safari</b> (on older iPhones just <b>Safari</b>).</li>
          <li>Tap <b>Microphone</b> and choose <b>Ask</b> or <b>Allow</b>.</li>
          <li>Come back here and tap <b>Try again</b>. If it still doesn't work, close the app completely and open it again.</li>
        </ol>
      ) : (
        <ol>
          <li>Tap the <b>⋮</b> menu (or the icon left of the address) → <b>Site settings</b> / <b>Permissions</b>.</li>
          <li>Set <b>Microphone</b> to <b>Allow</b>.</li>
          <li>Come back here and tap <b>Try again</b>.</li>
        </ol>
      )}
    </div>
  )
}

/**
 * Shown wherever the app needs to hear the piano but isn't listening yet.
 * Starting must come from a tap because iPhones require it.
 */
export function ListenGate({ compact = false }: { compact?: boolean }) {
  const mic = useMicState()
  const midi = useMidiState()
  const settings = useSettings()
  const ready = useInputReady()
  if (ready) return null

  if (settings.inputMode === 'midi') {
    return (
      <div className="card gate">
        <div className="mic-icon">
          <Icon name="piano" />
        </div>
        <h2>Connect your MIDI keyboard</h2>
        <p className="muted">
          {midi.status === 'unsupported'
            ? 'This browser cannot use MIDI keyboards (iPhones and iPads cannot). Switch to the microphone instead.'
            : midi.status === 'denied'
              ? 'MIDI access was blocked. Allow it in the browser settings, or use the microphone.'
              : midi.status === 'ready'
                ? 'No keyboard found. Plug it in with a USB cable (and an adapter if needed) and switch it on.'
                : 'Plug your keyboard in with a USB cable, then tap the button.'}
        </p>
        {midi.status !== 'unsupported' && (
          <button className="btn btn-primary btn-big" onClick={() => midiInput.enable()}>
            Connect keyboard
          </button>
        )}
        <button className="btn" onClick={() => updateSettings({ inputMode: 'auto' })}>
          Use the microphone instead
        </button>
      </div>
    )
  }

  const busy = mic.status === 'starting'
  return (
    <div className="card gate">
      {!compact && (
        <div className="mic-icon">
          <Icon name={mic.status === 'denied' ? 'micOff' : 'mic'} />
        </div>
      )}
      {mic.status === 'denied' ? (
        <>
          <h2>Microphone is blocked</h2>
          <p className="muted">Piano Coach needs the microphone to hear which notes you play. Nothing is recorded or sent anywhere.</p>
          <DeniedHelp />
        </>
      ) : mic.status === 'unsupported' || mic.status === 'error' ? (
        <>
          <h2>Can't use the microphone</h2>
          <p className="muted">{mic.message}</p>
        </>
      ) : (
        <>
          {!compact && <h2>{mic.status === 'paused' ? 'Listening paused' : 'Let the app hear your piano'}</h2>}
          {!compact && (
            <p className="muted">
              Put your phone on the music stand, facing the piano. Sound stays on your phone: nothing is recorded or sent anywhere.
            </p>
          )}
        </>
      )}
      {mic.status !== 'unsupported' && (
        <button className="btn btn-primary btn-big" disabled={busy} onClick={() => startListening()}>
          <Icon name="mic" />
          {busy ? 'Waiting for permission…' : mic.status === 'denied' || mic.status === 'error' ? 'Try again' : 'Tap to start listening'}
        </button>
      )}
      {midi.status !== 'unsupported' && !midiActive(settings, midi) && !compact && (
        <button className="btn" onClick={() => updateSettings({ inputMode: 'midi' })}>
          I have a USB MIDI keyboard
        </button>
      )}
    </div>
  )
}

/** Small status chip: tap to start/stop listening. */
export function MicPill() {
  const mic = useMicState()
  const midi = useMidiState()
  const settings = useSettings()
  if (midiActive(settings, midi)) {
    return (
      <span className="pill good" title={midi.devices.join(', ')}>
        <span className="dot" /> MIDI
      </span>
    )
  }
  const listening = mic.status === 'listening'
  return (
    <button
      className={`pill ${listening ? 'good' : ''}`}
      style={{ border: 'none', minHeight: 36 }}
      onClick={() => (listening ? micEngine.stop() : startListening())}
      aria-label={listening ? 'Listening. Tap to stop.' : 'Microphone off. Tap to start listening.'}
    >
      <span className="dot" /> {listening ? 'Listening' : 'Mic off'}
    </button>
  )
}
