import { href } from '../ui/router'
import { ScreenHeader } from '../ui/common'

export function HelpScreen() {
  return (
    <div className="screen">
      <ScreenHeader title="Help & tips" back={href('practice')} />
      <section className="card guide">
        <h3>Setting up</h3>
        <ol>
          <li>Stand your phone on the piano's music stand, screen facing you. The microphone is at the bottom of the phone, so keep it uncovered.</li>
          <li>Turn off the sustain pedal while you learn: ringing notes make detection harder.</li>
          <li>Go to <a href={href('play')}>Free Play</a>, tap <b>Tap to start listening</b> and allow the microphone.</li>
          <li>Play a few keys. The big letter should show each note you play. If it does, you are ready!</li>
        </ol>
      </section>
      <section className="card guide">
        <h3>How lessons work</h3>
        <ul>
          <li>The <b>blue key</b> on the screen keyboard is the next one to play. The note is also shown on the music staff.</li>
          <li>Small numbers are <b>finger numbers</b>: thumb = 1, index = 2, middle = 3, ring = 4, little finger = 5.</li>
          <li><b>Wait for me</b> mode waits for the right note. <b>Play in time</b> mode scrolls at a steady speed and scores your timing.</li>
          <li>Use <b>Speed</b> to slow down, <b>Loop a section</b> to repeat a hard part, and <b>Hands</b> to practise one hand at a time.</li>
          <li>Tap <b>Listen</b> to hear how the song should sound.</li>
          <li>You can also tap the on-screen keys if you don't have your piano with you.</li>
        </ul>
      </section>
      <section className="card guide">
        <h3>If notes aren't detected</h3>
        <ul>
          <li>Check the <b>Mic</b> chip at the top says "Listening". If not, tap it.</li>
          <li>Move the phone closer to the piano, or play a bit louder.</li>
          <li>Raise <b>Sensitivity</b> in Free Play or Settings.</li>
          <li>Digital piano: turn its volume up and unplug headphones (or use a USB MIDI cable on Android/computer).</li>
          <li>Play one key at a time and let go before the next one.</li>
        </ul>
        <h3>If the app hears notes you didn't play</h3>
        <ul>
          <li>Tap <b>Auto-adjust to my room</b> in Free Play while the room is quiet.</li>
          <li>Lower <b>Sensitivity</b>, and turn off TVs, music or fans nearby.</li>
          <li>Choose <b>Careful</b> note detection in Settings.</li>
          <li>If it hears the right letter but in the wrong octave, turn on <b>Accept the right note in any octave</b> in Settings.</li>
        </ul>
        <h3>Microphone permission</h3>
        <ul>
          <li>iPhone: Settings app → Apps → Safari → Microphone → Allow. Then close and reopen Piano Coach.</li>
          <li>Android (Chrome): tap the icon left of the web address (or ⋮ → Site settings) → Microphone → Allow.</li>
        </ul>
      </section>
      <section className="card guide">
        <h3>Privacy</h3>
        <p className="muted">Sound from the microphone is analysed on your phone only. Nothing is recorded, uploaded or shared. Your progress is stored on this device.</p>
      </section>
    </div>
  )
}
