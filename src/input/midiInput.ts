/** Optional Web MIDI input: a USB/Bluetooth keyboard gives exact notes. */

export type MidiStatus = 'off' | 'connecting' | 'ready' | 'denied' | 'unsupported'

export interface MidiState {
  status: MidiStatus
  devices: string[]
}

export interface MidiNoteEvent {
  midi: number
  velocity: number
  time: number
}

class MidiInput {
  state: MidiState = {
    status: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator ? 'off' : 'unsupported',
    devices: [],
  }
  private access: MIDIAccess | null = null
  private listeners = new Set<(s: MidiState) => void>()
  private noteListeners = new Set<(e: MidiNoteEvent) => void>()

  get supported() {
    return this.state.status !== 'unsupported'
  }

  subscribe = (fn: (s: MidiState) => void) => {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  getState = () => this.state
  onNote(fn: (e: MidiNoteEvent) => void) {
    this.noteListeners.add(fn)
    return () => void this.noteListeners.delete(fn)
  }

  private set(state: Partial<MidiState>) {
    this.state = { ...this.state, ...state }
    this.listeners.forEach((fn) => fn(this.state))
  }

  async enable(): Promise<void> {
    if (!this.supported || this.access || this.state.status === 'connecting') return
    this.set({ status: 'connecting' })
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
      this.access.onstatechange = () => this.refresh()
      this.refresh()
    } catch {
      this.set({ status: 'denied' })
    }
  }

  private refresh() {
    if (!this.access) return
    const devices: string[] = []
    this.access.inputs.forEach((input) => {
      if (input.state === 'disconnected') return
      devices.push(input.name || 'MIDI keyboard')
      input.onmidimessage = (e) => this.handle(e)
    })
    this.set({ status: 'ready', devices })
  }

  private handle(e: MIDIMessageEvent) {
    const data = e.data
    if (!data || data.length < 3) return
    const kind = data[0] & 0xf0
    if (kind === 0x90 && data[2] > 0) {
      const event = { midi: data[1], velocity: data[2], time: e.timeStamp || performance.now() }
      this.noteListeners.forEach((fn) => fn(event))
    }
  }
}

export const midiInput = new MidiInput()
