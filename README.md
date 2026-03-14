# Gym Timer

A full-screen CrossFit gym timer designed for box gyms. Runs on a laptop connected to a TV and is controlled from your phone over WiFi — no apps to install.

![Node.js](https://img.shields.io/badge/Node.js-Express-green) ![Socket.io](https://img.shields.io/badge/Socket.io-realtime-blue)

## How It Works

- **TV Display** — A laptop runs the timer in a full-screen browser and outputs to a TV via HDMI
- **Phone Controller** — Scan the QR code on the TV to open the controller on your phone
- **Real-time sync** — Commands from the phone are sent instantly to the display via WebSockets

## Features

- **9 timer modes**: Clock, Stopwatch, Countdown, Count Up, EMOM, Tabata, Interval, Fight Gone Bad, Warm Up
- **20 built-in presets** for common CrossFit workouts
- **QR code connection** — scan to connect, no URL typing
- **Audio cues** — 3-2-1 countdown beeps, phase transitions, and "TIME!" voice on completion
- **Visual indicators** — green (work), red (rest), orange (prep), red pulsing (final 3 seconds)
- **10-second prep countdown** before each workout
- **Coach authentication** — password-protected controller access
- **Auto-reconnect** — phone reconnects automatically if connection drops
- **One-click launch** — desktop shortcut starts the server and opens the display

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- A modern browser (Chrome/Chromium recommended)

### Install & Run

```bash
git clone https://github.com/jbaseball362/gym-timer.git
cd gym-timer
npm install
npm start
```

Open `http://localhost:3000` for the display and `http://localhost:3000/control` on your phone to control it.

### One-Click Launch (Linux)

Use the included `start-gym-timer.sh` script to start the server and open the display in kiosk mode with audio auto-enabled:

```bash
./start-gym-timer.sh
```

A desktop shortcut (`Gym Timer.desktop`) is also provided.

## Architecture

```
Phone (controller)  ←—WebSocket—→  Node.js Server  ←—WebSocket—→  Browser (TV display)
                                    (Express + Socket.io)
```

- **Server**: Node.js + Express + Socket.io — serves pages and relays commands
- **Display**: Full-screen timer rendered in the browser, output to TV via HDMI
- **Controller**: Mobile-friendly web page with timer controls
- **Audio**: Web Audio API generates beeps in the browser (no audio files)
- **QR Code**: Custom client-side generator — no external dependencies

## Configuration

| Setting | Default | How to change |
|---------|---------|---------------|
| Port | 3000 | Set `PORT` env variable |
| Coach password | `coach123` | Set `COACH_PASSWORD` env variable |

## File Structure

```
├── server.js              # Express server + Socket.io hub
├── start-gym-timer.sh     # Launch script (server + browser)
├── coach-guide.html       # Printable 1-page coach quick start
├── public/
│   ├── display.html       # TV display page
│   ├── control.html       # Phone controller page
│   ├── css/
│   │   ├── display.css    # Display styles + phase colors
│   │   └── control.css    # Controller styles
│   └── js/
│       ├── timer-engine.js # Core timer logic + presets
│       ├── audio.js        # Web Audio API beep generation
│       ├── display.js      # Display page logic
│       ├── control.js      # Controller page logic
│       └── qr.js           # QR code generator (no deps)
```

## Built With

- [Express](https://expressjs.com/) — web server
- [Socket.io](https://socket.io/) — real-time WebSocket communication
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — sound generation
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) — voice announcements

## Author

**Josh Echevarria** — [GitHub](https://github.com/jbaseball362)

Built with [Claude Code](https://claude.ai/claude-code) by Anthropic.

## License

This project is for personal use. Feel free to reference it for your own gym timer setup.
