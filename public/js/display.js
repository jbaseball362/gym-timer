/**
 * Display page — runs on the TV
 * Receives commands from controller via Socket.io
 * Runs the timer engine locally for smooth display
 */

const socket = io();
const timer = new TimerEngine();
const audio = new AudioManager();

// State
let currentBrightness = 5;

// DOM elements
const body = document.getElementById('display');
const timeDisplay = document.getElementById('time-display');
const modeLabel = document.getElementById('mode-label');
const roundInfo = document.getElementById('round-info');
const phaseLabel = document.getElementById('phase-label');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

// Mode display names
const MODE_NAMES = {
  clock: 'CLOCK',
  stopwatch: 'STOPWATCH',
  emom: 'EMOM',
  fgb: 'FIGHT GONE BAD',
  interval: 'INTERVAL',
  countdown: 'COUNTDOWN',
  countup: 'COUNT UP',
  tabata: 'TABATA',
  warmup: 'WARM UP',
};

// Wire up timer callbacks
timer.onUpdate = (display) => {
  if (display.mode === 'clock') {
    timeDisplay.innerHTML = display.time;
  } else {
    timeDisplay.textContent = display.time;
  }

  // Auto-scale font based on character count
  timeDisplay.classList.remove('digits-short', 'digits-long');
  if (display.time.length >= 7) {
    timeDisplay.classList.add('digits-long');
  } else if (display.time.length <= 3) {
    timeDisplay.classList.add('digits-short');
  }

  modeLabel.textContent = MODE_NAMES[display.mode] || display.mode.toUpperCase();

  // Phase class on body (preserve transient state classes)
  const cursorHidden = body.classList.contains('cursor-hidden');
  body.className = `phase-${display.phase}`;
  if (cursorHidden) body.classList.add('cursor-hidden');
  if (display.urgent) body.classList.add('urgent');

  // Apply brightness
  body.classList.add(`brightness-${currentBrightness}`);

  // Round info
  if (display.round) {
    roundInfo.textContent = display.round;
    roundInfo.classList.remove('hidden');
  } else {
    roundInfo.classList.add('hidden');
  }

  // Phase label
  if (display.phaseLabel) {
    phaseLabel.textContent = display.phaseLabel;
    phaseLabel.classList.remove('hidden');
  } else {
    phaseLabel.classList.add('hidden');
  }

  // Progress bar
  if (display.progress > 0 && display.phase !== 'idle' && display.phase !== 'complete') {
    progressContainer.classList.remove('hidden');
    progressBar.style.width = `${display.progress * 100}%`;
  } else {
    progressContainer.classList.add('hidden');
  }

  // Sync state back to server periodically
  socket.emit('state-update', display);
};

timer.onBeep = (type) => {
  audio.play(type);
};

timer.onComplete = () => {
  // Flash or other complete behavior handled by CSS
};

// Start with clock mode
timer.startMode('clock');

// Handle commands from the controller
socket.on('command', (data) => {

  switch (data.action) {
    case 'start-mode':
      timer.startMode(data.mode, data.config || {});
      if (data.autoStart) {
        timer.play();
      }
      break;

    case 'play':
      timer.play();
      break;

    case 'pause':
      timer.pause();
      break;

    case 'stop':
      timer.stop();
      timer.startMode('clock');
      break;

    case 'reset':
      timer.reset();
      break;

    case 'toggle-24hr':
      timer.use24hr = !timer.use24hr;
      break;

    case 'set-brightness':
      currentBrightness = data.level;
      break;

    case 'set-volume':
      audio.setVolume(data.level);
      break;

    case 'set-prep':
      timer.prepCountdown = data.enabled;
      break;

    case 'test-sound':
      audio.go();
      break;
  }
});

// Auto-initialize audio (works when browser launched with --autoplay-policy=no-user-gesture-required)
audio.unlock();

// Connection status warning
const connWarning = document.getElementById('conn-warning');
socket.on('connect', () => connWarning.classList.add('hidden'));
socket.on('disconnect', () => connWarning.classList.remove('hidden'));

// Splash screen — dismiss when a controller authenticates
let splashDismissed = false;
socket.on('controller-connected', () => {
  if (splashDismissed) return;
  splashDismissed = true;

  const splash = document.getElementById('qr-splash');
  splash.classList.add('dismissed');
  // After fade-out, remove from DOM entirely
  setTimeout(() => splash.remove(), 600);
});

// Fullscreen via the Fullscreen API (ESC exits instantly, unlike native F11)
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}

document.addEventListener('keydown', (e) => {
  // Intercept F11 to use Fullscreen API instead of native fullscreen
  if (e.key === 'F11') {
    e.preventDefault();
    toggleFullscreen();
    return;
  }

  // Keyboard shortcuts for timer control
  switch (e.key) {
    case ' ':
      e.preventDefault();
      if (timer.status === 'running') {
        timer.pause();
      } else {
        timer.play();
      }
      break;
    case 'r':
      timer.reset();
      break;
    case 's':
      timer.stop();
      timer.startMode('clock');
      break;
  }
});

// Auto-enter fullscreen on first click (uses Fullscreen API so ESC exits instantly)
let enteredFullscreen = false;
document.addEventListener('click', () => {
  if (!enteredFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen();
    enteredFullscreen = true;
  }
});

// Double-click also toggles fullscreen
document.addEventListener('dblclick', () => toggleFullscreen());

// Hide cursor after 5 seconds of inactivity
let cursorHideTimer = null;
body.classList.add('cursor-hidden');
document.addEventListener('mousemove', () => {
  body.classList.remove('cursor-hidden');
  clearTimeout(cursorHideTimer);
  cursorHideTimer = setTimeout(() => body.classList.add('cursor-hidden'), 5000);
});

// Fetch control URL and render QR codes (splash + corner)
fetch('/api/info')
  .then(r => r.json())
  .then(info => {
    if (typeof QR === 'undefined') return;

    // Large splash QR
    const splashCanvas = document.getElementById('qr-splash-canvas');
    if (splashCanvas) {
      QR.renderCanvas(splashCanvas, info.controlUrl, 8, 2);
    }

    // Small corner QR
    const cornerCanvas = document.getElementById('qr-canvas');
    if (cornerCanvas) {
      QR.renderCanvas(cornerCanvas, info.controlUrl, 3, 2);
    }

    // Show URL text on splash for manual entry
    const splashUrl = document.getElementById('splash-url');
    if (splashUrl) {
      splashUrl.textContent = info.controlUrl;
    }
  })
  .catch(() => {});
