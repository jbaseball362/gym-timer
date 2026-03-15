# Gym Timer — Project Context

## Overview
CrossFit gym timer web app. Runs on an Ubuntu laptop connected via HDMI to a Roku TV mounted on the gym wall. Phone controls the timer over WiFi. Personal gym use only, not commercial.

## User
- Name: Josh
- Gym setup: Ubuntu laptop (Lenovo Yoga 730, Ubuntu 24.04) → HDMI → Roku TV (TV is just a monitor, browser runs on the laptop)
- Phone: iPhone 15 Pro used as controller
- Network: phone and laptop must be on the same WiFi network (guest WiFi isolation blocks access)
- Josh prefers direct implementation over discussion. When he proposes a change, build it.
- He notices small UX details (alignment, spacing, glow intensity, leading zeros) and expects precision.
- After changes, he typically asks to "commit and push" — do it without asking for confirmation.
- Always check BOTH display and controller when making visual changes — they must stay consistent.
- iOS doesn't support the Vibration API — use audio click feedback instead for haptics.
- Prefers CSS `vertical-align: baseline` over manual positioning — "let the browser handle it."
- Dislikes technical jargon in user-facing elements.

## Version & Branching
- **v1.0** tagged and shipped (2026-03-13), iterating toward v1.1
- **`main`** branch: live/production — runs in the gym, don't break it
- **`dev`** branch: development — new features built here, merged to `main` when ready
- Gym laptop stays on `main`. Dev laptop works on `dev`.

## Architecture
- **Server**: Node.js + Express + Socket.io (`server.js`, port 3000)
- **Display page**: `localhost:3000/` — full-screen timer shown on TV via laptop browser
- **Controller page**: `localhost:3000/control` — phone remote
- **Communication**: WebSocket (Socket.io) between controller → server → display
- **Audio**: Web Audio API generates beeps in browser (no audio files)
- **QR Code**: Custom client-side QR generator (`qr.js`) — no external deps

## File Structure
```
Gym Timer/
├── package.json              # Express + Socket.io deps
├── server.js                 # Express server, Socket.io hub, auth, /api/info endpoint
├── start-gym-timer.sh        # Launch script (Linux/macOS): starts server + opens browser
├── start-gym-timer.bat       # Launch script (Windows): starts server + opens browser
├── gym-timer-icon.svg        # Desktop shortcut icon
├── coach-guide.html          # Printable 1-page coach quick start guide
└── public/
    ├── display.html          # TV display page (full-screen timer)
    ├── control.html          # Phone controller page (login overlay + controls)
    ├── css/
    │   ├── display.css       # Display styles: phase colors, auto-scale, QR splash
    │   └── control.css       # Controller styles: login overlay, mode grid, settings
    └── js/
        ├── timer-engine.js   # Core TimerEngine class + PRESETS array (20 presets)
        ├── audio.js          # AudioManager class: Web Audio API beep generation
        ├── display.js        # Display page logic: timer callbacks, socket commands, QR fetch
        ├── control.js        # Controller page logic: mode selection, config UIs, auth
        └── qr.js             # Client-side QR code generator (canvas-based, no deps)
```

## Key Classes
- **TimerEngine** (`timer-engine.js`): Manages all timer modes, phases, ticking, beep callbacks
  - Modes: clock, stopwatch, emom, fgb, interval, countdown, countup, tabata, warmup
  - Phases: idle, prep, work, rest, complete
  - `PRESETS` array: 20 pre-programmed intervals for common CrossFit workouts
  - `stop()` preserves timer state (freeze), `reset()` clears to zero
  - Stopwatch uses `formatTimeMs()` for hundredths of a second (M:SS.cc)
  - No leading zero on minutes tens position (e.g., `3:23` not `03:23`)
- **AudioManager** (`audio.js`): Web Audio API beep generation
  - Audio auto-unlocks when browser launched with `--autoplay-policy=no-user-gesture-required` (see start-gym-timer.sh)
  - Beep types: tick (880Hz, 3-2-1 countdown), go (1000→1400Hz, work start), rest (440Hz, rest start), complete (800→1000→1200Hz triple)
  - Gain: `volume * 0.8`, volume slider 0-5 maps to 0.0-1.0
  - AudioContext keepalive prevents missed first beep (silent oscillator every 3 seconds)
  - "TIME!" voice announcement via Web Speech API on workout completion

## Socket Events
- `command` (controller→server→display): Timer commands (start-mode, play, pause, stop, reset, lap, lap-summary, clear-laps, etc.)
- `state-update` (display→server): Timer display state
- `state-sync` (server→controller): Broadcast display state to controllers
- `auth` (controller→server): Password authentication
- `auth-required` (server→controller): Session expired
- `controller-connected` (server→all): Dismisses QR splash screen

## Config
- Default port: 3000
- Coach password: env `COACH_PASSWORD` (default: `coach123`)
- Start: `npm start` (server only) or `./start-gym-timer.sh` (server + browser with audio unlocked)

## Key Features
- 9 timer modes (clock, stopwatch, emom, fgb, interval, countdown, countup, tabata, warmup)
- 20 pre-programmed interval presets for common CrossFit workouts
- Stopwatch: hundredths of a second, lap tracking with split times, average and best lap summary (shown on both controller and TV display)
- QR splash screen on boot (dismissed when controller connects)
- Attribution credit on splash screen ("Made with Claude Code by Josh Echevarria")
- Coach password authentication with auto-reconnect via sessionStorage
- 10-second prep countdown (togglable, all modes except stopwatch)
- 3-2-1 beeps before expiration on all timed modes
- "TIME!" voice announcement on completion
- Red pulsing urgent state during final 3 seconds
- Green (WORK) / Red (REST) / Orange (PREP) color indicators
- Stop/Reset confirmation ("SURE?" tap) on workout modes, instant stop on stopwatch/countup
- Clear Laps also requires confirmation tap
- Stop preserves timer display, reset clears to zero
- Pause button toggles to "RESUME" when paused
- Haptic feedback (Android) + click sound (all devices) on transport buttons
- Brightness stepper (1-5) and volume stepper (0-5) with audible feedback, both default to 5
- 12/24hr clock toggle
- Collapsible settings panel
- Tappable values for direct keyboard input (not just +/- buttons)
- Auto-scaling time display
- Clock format: no seconds, lowercase am/pm in smaller font, baseline-aligned, zero-width so time stays centered
- Font: Arial Black (clean zeros without dots)
- Cursor auto-hide after 5 seconds inactivity
- Keyboard shortcuts (space=play/pause, r=reset, s=stop)
- Auto-fullscreen on first click (Fullscreen API, ESC exits instantly)
- iOS double-tap zoom disabled via `touch-action: manipulation`
- Disconnected warning on display
- Cross-platform launch scripts (Linux, macOS, Windows) with multi-browser support
- Printable 1-page coach guide (coach-guide.html)

## Important Implementation Details
- `body.className` is reassigned every 50ms by the timer update loop — any transient classes (cursor-hidden, urgent, brightness-N) must be re-applied after the reassignment, not just set once
- Clock mode uses `innerHTML` (for am/pm `<span>`), all other modes use `textContent`
- Brightness is stored in a `currentBrightness` variable in display.js, not on the timer object
- am/pm uses `width: 0; overflow: visible` trick to render visually without affecting centering
- All `parseInt()` calls must include radix 10

## Known Considerations
- Target browser: desktop Chromium/Firefox (not smart TV browsers)
- Firefox doesn't support `--autoplay-policy` flag — will need tap-to-unlock for audio
- Wayland limits RustDesk unattended access on the gym laptop
- Laptop lid close needs `HandleLidSwitch=ignore` in logind.conf for HDMI operation

## Future Backlog (not yet implemented)
- Save settings to localStorage (brightness, volume, last mode persist across sessions)
- Small clock in corner during workouts (subtle time-of-day display)
- Preset favorites (pin most-used presets, coach saves via localStorage)
- Display brightness dimming on idle (auto-dim to prevent burn-in)
- Voice commands (speech-to-text for hands-free timer setup)

## GitHub
- Repo: https://github.com/jbaseball362/gym-timer (public, used as portfolio piece)
- All Rogue Fitness references removed from code and git history
