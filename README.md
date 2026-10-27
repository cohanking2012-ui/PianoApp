# Piano Coach 🎹

A free piano-learning web app for your phone. Put your phone on the piano, pick a lesson, and play: Piano Coach **listens through the microphone**, works out which note you played, and tells you straight away whether it was right — like the "listen mode" in Simply Piano or Flowkey.

It is a Progressive Web App (PWA): no app store, works on iPhone (Safari) and Android (Chrome), can be added to the home screen, and works offline after the first visit. Nothing is recorded or uploaded; progress is saved on the device.

**Open it:** https://cohanking2012-ui.github.io/PianoApp/ (once GitHub Pages is switched on — see [Hosting](#hosting)).

## Features

- **Lessons with live feedback** – a scrolling music staff and an on-screen keyboard show the next note (with its name and finger number). Green = right, red = wrong, with "You played D4 — try E4".
  - **Wait for me** mode: the song waits for the right note.
  - **Play in time** mode: notes scroll at a steady tempo with a metronome count-in, and you're scored on timing.
  - Speed control (30–150 %), loop any range of bars, practise right hand, left hand or both.
  - **Listen** button plays the passage so you know how it should sound.
  - Results with accuracy, stars and personal bests.
- **23 built-in lessons**: finding middle C, single notes, five-finger exercises for each hand, black keys, scales (C major both hands, G major, A minor), then public-domain songs: Hot Cross Buns, Mary Had a Little Lamb, Ode to Joy, Twinkle Twinkle, Au Clair de la Lune, London Bridge, Jingle Bells, Row Row Row Your Boat, Minuet in G (Petzold) and the opening of Für Elise.
- **Song library** with over 100 public-domain songs (classical themes, folk songs, Christmas carols, hymns, kids' songs and anthems), searchable and filterable by category and difficulty.
- **Free Play** – shows every note you play with a tuner needle and microphone level meter; the place to test the microphone. "Auto-adjust to my room" sets the noise gate from the room's background noise.
- **Practice tools** – metronome (tap tempo, 2/3/4/6 beats), note quiz (find the note by name or read it from the staff), keyboard guide.
- **MIDI keyboards** – plug a keyboard in with USB (Android/computer Chrome) for exact note detection. iPhones don't support Web MIDI, so they use the microphone.
- **Import MIDI files** (.mid) as new songs.
- Settings: sensitivity, detection speed, octave-forgiving mode, A4 tuning, C-D-E or Do-Re-Mi names, light/dark theme.

## How the listening works

`src/audio/micEngine.ts` reads the microphone through the Web Audio API (echo cancellation, noise suppression and auto-gain are turned off, a 45 Hz high-pass removes rumble). About 60 times a second it takes the latest 2048 samples and:

1. measures the loudness — anything below the **noise gate** (set by the Sensitivity slider) is ignored;
2. runs the **YIN pitch detector** (`src/audio/yin.ts`, written from the paper: difference function → cumulative-mean normalisation → absolute threshold → parabolic interpolation), limited to the notes the current lesson uses;
3. converts the frequency to the nearest MIDI note, rejecting readings more than 45 cents off;
4. feeds the result to the **note tracker** (`src/audio/noteTracker.ts`), which only reports a note once it has been steady for a short **confirmation window** (40–100 ms), detects **new key strikes** from a sudden jump in loudness (so repeated notes like E-E-E count), and ignores octave/harmonic jumps and notes that are merely still ringing.

The app mutes its own detection while it is playing sounds (demo playback, tapped keys), so it doesn't hear itself.

## Using it

1. Open the link on your phone. Tap **Free Play → Tap to start listening**, allow the microphone, and play a few keys to check the big note name follows you.
2. Go to **Learn** and start with **Find Middle C**.
3. If notes aren't detected, or wrong notes appear, see **Practice → Help & tips** in the app.

## Running it on your own computer

You need [Node.js](https://nodejs.org) 20.19 or newer.

```bash
npm install
npm run dev          # opens on http://localhost:5173 (microphone works on localhost)
```

To try it on a phone on the same Wi-Fi without hosting: `npm run dev:phone`, then open the `https://<your-computer's-IP>:5173` address it prints on the phone and accept the "not secure / self-signed certificate" warning (the microphone needs https).

Other commands:

```bash
npm test             # unit tests (pitch detection with synthetic waves, note matching, songs, MIDI import)
npm run build        # type-check and build the app into dist/
npm run preview      # serve the built app
npm run e2e          # after a build: runs the real app in Chromium with a fake microphone (needs Playwright)
```

## Hosting

The GitHub Actions workflow in `.github/workflows/deploy.yml` tests and builds the app on every push and publishes `dist/` to the `gh-pages` branch. GitHub Pages then serves it at `https://<user>.github.io/PianoApp/` over HTTPS (required for the microphone).

One-time setup on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `gh-pages` / `(root)` → Save.** (On a free GitHub account the repository must be public for Pages to work.)

Because the build uses relative paths, the `dist/` folder also works on any other static host (Netlify, Cloudflare Pages, Vercel…).

## Adding songs

Lessons are plain JSON files in `src/data/songs/`, listed in lesson order in `src/data/curriculum.json`. Songs for the **Songs** tab live in `src/data/library/` and need a `category` (one of the categories in `src/data/library.ts`) and a `difficulty` (1 easy – 3 harder). Any `.json` file added to either folder is picked up automatically.

```json
{
  "id": "my-song",
  "title": "My Song",
  "composer": "Traditional",
  "intro": "Shown before the lesson starts.",
  "tips": ["Optional extra tips."],
  "bpm": 100,
  "timeSignature": [4, 4],
  "pickup": 0,
  "hand": "R",
  "category": "Folk & traditional",
  "difficulty": 1,
  "notes": [
    { "note": "E4", "dur": 1, "finger": 3 },
    { "note": "D4", "dur": 1, "finger": 2 },
    { "note": "C4", "dur": 2, "finger": 1 },
    { "note": "rest", "dur": 1 },
    { "note": "G3", "dur": 1, "hand": "L", "finger": 1 }
  ]
}
```

- `note`: a name like `C4` (middle C), `F#3`, `Bb4`; `"rest"` for silence; or a list like `["C3", "E3", "G3"]` for a chord.
- `dur`: length in beats (1 = one beat of the time signature; 0.5 = half a beat).
- `hand`: `"R"` or `"L"` (defaults to the song's `hand`, which defaults to `"R"`).
- `finger`: optional finger number 1–5 (thumb = 1).
- `start`: optional explicit start time in beats; otherwise each note follows the previous one.
- `pickup`: length in beats of an incomplete first bar.

`npm test` checks every song file for mistakes. Songs can also be imported in the app from MIDI files (Learn → My songs → Import a MIDI file).

## Project layout

```
src/
  audio/      yin.ts (pitch detection), noteTracker.ts, micEngine.ts, synth.ts, metronome.ts
  input/      inputHub.ts (mic / MIDI / touch → one note stream), midiInput.ts (Web MIDI)
  music/      notes.ts, song.ts (song format), session.ts (wait/tempo scoring), midiFile.ts (.mid import)
  data/       songs/*.json, curriculum.json
  screens/    Home, Lesson player, Free Play, Practice tools, Settings, Help
  ui/         Staff (SVG music staff), PianoKeyboard, ListenGate (mic permission), …
  state/      settings, progress, imported songs (localStorage)
sw/           service worker template (offline support; file list generated at build)
tests/        unit tests (vitest)
scripts/      e2e.mjs (Chromium + fake microphone), make-icons.mjs
```

All songs included are in the public domain (traditional melodies and works by composers who died well over 100 years ago).
