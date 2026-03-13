# Gym Timer — Project Context

## Overview
CrossFit gym timer web app modeled after the Rogue Fitness Home Timer (reference PDF in project root). Runs on an Ubuntu laptop connected via HDMI to a Roku TV mounted on the gym wall. Phone controls the timer over WiFi. Personal gym use only, not commercial.

## User
- Name: Josh
- Gym setup: Ubuntu laptop → HDMI → Roku TV (TV is just a monitor, browser runs on the laptop)
- Phone used for controller, TV for display
- Network: may not have static IP access → QR code solution on display

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
├── start-gym-timer.sh        # Launch script: starts server + opens browser (fullscreen, audio unlocked)
├── gym-timer-icon.svg        # Desktop shortcut icon
├── coach-guide.html          # Printable 1-page coach quick start guide
├── Home_Timer_User_manual_fc3rem.pdf  # Rogue timer reference (2 pages)
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
  - `PRESETS` array: 20 pre-programmed intervals matching Rogue manual
- **AudioManager** (`audio.js`): Web Audio API beep generation
  - Audio auto-unlocks when browser launched with `--autoplay-policy=no-user-gesture-required` (see start-gym-timer.sh)
  - Beep types: tick (880Hz, 3-2-1 countdown), go (1000→1400Hz, work start), rest (440Hz, rest start), complete (800→1000→1200Hz triple)
  - Gain: `volume * 0.8`, volume slider 0-5 maps to 0.0-1.0

## Socket Events
- `command` (controller→server→display): Timer commands (start-mode, play, pause, stop, reset, etc.)
- `state-update` (display→server): Timer display state
- `state-sync` (server→controller): Broadcast display state to controllers
- `auth` (controller→server): Password authentication
- `auth-required` (server→controller): Session expired

## Config
- Default port: 3000
- Coach password: env `COACH_PASSWORD` (default: `coach123`)
- Start: `npm start` (server only) or `./start-gym-timer.sh` (server + kiosk browser with audio unlocked)

## Key Features
- All 9 timer modes matching Rogue manual
- 20 pre-programmed interval presets
- Green (WORK) / Red (REST) / Orange (PREP) color indicators
- 10-second prep countdown (togglable)
- Audio beeps for 3-2-1 countdowns, phase transitions, workout complete
- QR code on display for easy phone connection
- Coach password authentication
- Brightness/volume controls, 12/24hr clock toggle, collapsible settings panel
- Tappable values for direct keyboard input (not just +/- buttons)
- Auto-scaling time display

## Known Issues
- Target browser: desktop Chromium/Firefox on Ubuntu (not smart TV browsers)

## Hardware Setup
The Roku TV is just a monitor. The Ubuntu laptop runs both the Node.js server and the display browser. Audio comes from the laptop (or TV via HDMI audio). Since we control the laptop, browser flags and OS-level config are available.
