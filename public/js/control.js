/**
 * Controller page — runs on your phone
 * Sends commands to the display via Socket.io
 */

const socket = io();
let selectedMode = 'clock';
let currentConfig = {};
let authenticated = false;

// DOM references
const loginOverlay = document.getElementById('login-overlay');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const connStatus = document.getElementById('conn-status');
const ctrlTime = document.getElementById('ctrl-time');
const ctrlMode = document.getElementById('ctrl-mode');
const ctrlPhase = document.getElementById('ctrl-phase');
const ctrlRound = document.getElementById('ctrl-round');
const configSection = document.getElementById('config-section');
const configTitle = document.getElementById('config-title');
const configContent = document.getElementById('config-content');
const presetsSection = document.getElementById('presets-section');
const presetList = document.getElementById('preset-list');
const startBtn = document.getElementById('start-btn');

// Connection status
socket.on('connect', () => {
  connStatus.textContent = 'Connected';
  connStatus.className = 'status connected';

  // Re-authenticate automatically on reconnect
  const savedPassword = sessionStorage.getItem('coach-password');
  if (savedPassword && !authenticated) {
    socket.emit('auth', savedPassword, (response) => {
      if (response.success) {
        authenticated = true;
        loginOverlay.classList.add('hidden');
      }
    });
  }
});

socket.on('disconnect', () => {
  connStatus.textContent = 'Disconnected';
  connStatus.className = 'status disconnected';
  authenticated = false;
});

socket.io.on('reconnect_attempt', () => {
  connStatus.textContent = 'Reconnecting...';
  connStatus.className = 'status reconnecting';
});

// Receive state updates from display
const pauseBtn = document.querySelector('.btn-pause');
socket.on('state-sync', (state) => {
  ctrlTime.innerHTML = state.time || '--:--';
  ctrlMode.textContent = state.mode ? state.mode.toUpperCase() : '';

  ctrlPhase.textContent = state.phaseLabel || '';
  ctrlPhase.className = 'current-phase ' + (state.phase || '');

  ctrlRound.textContent = state.round || '';

  // Toggle pause/resume button text
  if (state.status === 'paused') {
    pauseBtn.textContent = 'RESUME';
    pauseBtn.onclick = () => { sendCommand('play'); };
  } else {
    pauseBtn.textContent = 'PAUSE';
    pauseBtn.onclick = () => sendCommand('pause');
  }
});

// Button feedback: haptic (Android) + click sound (all devices)
let clickCtx;
function buttonFeedback(ms = 30) {
  if (navigator.vibrate) navigator.vibrate(ms);
  try {
    if (!clickCtx) clickCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = clickCtx.createOscillator();
    const gain = clickCtx.createGain();
    osc.connect(gain);
    gain.connect(clickCtx.destination);
    osc.frequency.value = 1200;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, clickCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, clickCtx.currentTime + 0.04);
    osc.start(clickCtx.currentTime);
    osc.stop(clickCtx.currentTime + 0.04);
  } catch (e) {}
}

// Send command to server
function sendCommand(action, extra = {}) {
  buttonFeedback();
  socket.emit('command', { action, ...extra });
}

/**
 * Make a span tappable to edit its value inline.
 * - spanId: the id of the <span> element
 * - onCommit(newValue): called with the parsed integer when the user confirms
 * - min/max: clamp the value
 */
function makeEditable(spanId, onCommit, min = 0, max = 99) {
  const span = document.getElementById(spanId);
  if (!span || span.dataset.editable) return;
  span.dataset.editable = 'true';
  span.style.cursor = 'pointer';
  span.style.textDecoration = 'underline';
  span.style.textDecorationStyle = 'dotted';
  span.style.textUnderlineOffset = '4px';

  span.addEventListener('click', () => {
    const currentVal = span.textContent.trim();
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentVal;
    input.min = min;
    input.max = max;
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
    input.style.cssText = `
      width: 60px; padding: 6px; text-align: right;
      font-size: 16px; font-family: 'Courier New', monospace;
      background: #333; color: #fff; border: 2px solid #ff2d2d;
      border-radius: 6px; outline: none;
    `;

    span.replaceWith(input);
    input.focus();
    // Place cursor at the end (right side)
    const len = input.value.length;
    input.setSelectionRange(len, len);

    const commit = () => {
      let val = parseInt(input.value, 10);
      if (isNaN(val)) val = parseInt(currentVal, 10);
      val = Math.max(min, Math.min(max, val));

      const newSpan = document.createElement('span');
      newSpan.id = spanId;
      newSpan.textContent = val;
      input.replaceWith(newSpan);

      onCommit(val);

      // Re-attach editable behavior to the new span
      setTimeout(() => makeEditable(spanId, onCommit, min, max), 0);
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
  });
}

// Mode selection
function selectMode(mode) {
  selectedMode = mode;

  // Highlight active button
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Show/hide config, presets, and laps
  presetsSection.style.display = 'none';
  configSection.style.display = 'none';
  document.getElementById('lap-section').style.display = mode === 'stopwatch' ? 'block' : 'none';
  if (mode !== 'stopwatch') clearLaps();

  switch (mode) {
    case 'clock':
      // Immediately switch to clock, no config needed
      sendCommand('start-mode', { mode: 'clock' });
      break;

    case 'stopwatch':
      sendCommand('start-mode', { mode: 'stopwatch' });
      configSection.style.display = 'none';
      break;

    case 'warmup':
      showWarmupConfig();
      break;

    case 'emom':
      showEmomConfig();
      break;

    case 'fgb':
      configSection.style.display = 'block';
      configTitle.textContent = 'FIGHT GONE BAD';
      configContent.innerHTML = `
        <p style="color:#aaa; font-size:14px; line-height:1.5; padding:8px 0;">
          3 rounds &times; 5 minutes work<br>
          1 minute rest between rounds<br>
          17 minutes total
        </p>`;
      sendCommand('start-mode', { mode: 'fgb' });
      break;

    case 'tabata':
      showTabataConfig();
      break;

    case 'interval':
      showIntervalConfig();
      showPresets();
      break;

    case 'countdown':
      showCountdownConfig();
      break;

    case 'countup':
      showCountupConfig();
      break;
  }
}

// Tabata config
function showTabataConfig() {
  configSection.style.display = 'block';
  configTitle.textContent = 'TABATA SETTINGS';
  currentConfig = { workTime: 20, restTime: 10, rounds: 8 };

  configContent.innerHTML = `
    <div class="setting-row">
      <span class="setting-label">Work (sec)</span>
      <div class="setting-value">
        <button onclick="adjustTabata('work', -5)">−</button>
        <span id="tab-work">20</span>
        <button onclick="adjustTabata('work', 5)">+</button>
      </div>
    </div>
    <div class="setting-row">
      <span class="setting-label">Rest (sec)</span>
      <div class="setting-value">
        <button onclick="adjustTabata('rest', -5)">−</button>
        <span id="tab-rest">10</span>
        <button onclick="adjustTabata('rest', 5)">+</button>
      </div>
    </div>
    <div class="setting-row">
      <span class="setting-label">Rounds</span>
      <div class="setting-value">
        <button onclick="adjustTabata('rounds', -1)">−</button>
        <span id="tab-rounds">8</span>
        <button onclick="adjustTabata('rounds', 1)">+</button>
      </div>
    </div>
    <p id="tab-total" style="color:#666; font-size:12px; padding-top:8px;">
      Total: 4:00
    </p>`;

  sendCommand('start-mode', { mode: 'tabata', config: currentConfig });

  // Make values tappable for direct input
  makeEditable('tab-work', (val) => {
    currentConfig.workTime = val;
    updateTabataTotal();
    sendCommand('start-mode', { mode: 'tabata', config: currentConfig });
  }, 5, 300);
  makeEditable('tab-rest', (val) => {
    currentConfig.restTime = val;
    updateTabataTotal();
    sendCommand('start-mode', { mode: 'tabata', config: currentConfig });
  }, 0, 300);
  makeEditable('tab-rounds', (val) => {
    currentConfig.rounds = val;
    updateTabataTotal();
    sendCommand('start-mode', { mode: 'tabata', config: currentConfig });
  }, 1, 99);
}

function updateTabataTotal() {
  const totalSec = (currentConfig.workTime + currentConfig.restTime) * currentConfig.rounds;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const el = document.getElementById('tab-total');
  if (el) el.textContent = `Total: ${min}:${String(sec).padStart(2, '0')}`;
}

function adjustTabata(field, delta) {
  if (field === 'work') {
    currentConfig.workTime = Math.max(5, Math.min(120, currentConfig.workTime + delta));
    document.getElementById('tab-work').textContent = currentConfig.workTime;
  } else if (field === 'rest') {
    currentConfig.restTime = Math.max(0, Math.min(120, currentConfig.restTime + delta));
    document.getElementById('tab-rest').textContent = currentConfig.restTime;
  } else if (field === 'rounds') {
    currentConfig.rounds = Math.max(1, Math.min(99, currentConfig.rounds + delta));
    document.getElementById('tab-rounds').textContent = currentConfig.rounds;
  }
  updateTabataTotal();
  sendCommand('start-mode', { mode: 'tabata', config: currentConfig });
}

// EMOM config
function showEmomConfig() {
  configSection.style.display = 'block';
  configTitle.textContent = 'EMOM SETTINGS';
  currentConfig = { rounds: 20 };

  configContent.innerHTML = `
    <div class="setting-row">
      <span class="setting-label">Rounds</span>
      <div class="setting-value">
        <button onclick="adjustEmom(-1)">−</button>
        <span id="emom-rounds">20</span>
        <button onclick="adjustEmom(1)">+</button>
      </div>
    </div>
    <p style="color:#666; font-size:12px; padding-top:8px;">
      1 minute per round, every minute on the minute
    </p>`;

  sendCommand('start-mode', { mode: 'emom', config: currentConfig });

  makeEditable('emom-rounds', (val) => {
    currentConfig.rounds = val;
    sendCommand('start-mode', { mode: 'emom', config: currentConfig });
  }, 1, 99);
}

function adjustEmom(delta) {
  currentConfig.rounds = Math.max(1, Math.min(99, (currentConfig.rounds || 20) + delta));
  document.getElementById('emom-rounds').textContent = currentConfig.rounds;
  sendCommand('start-mode', { mode: 'emom', config: currentConfig });
}

// Warmup config
function showWarmupConfig() {
  configSection.style.display = 'block';
  configTitle.textContent = 'WARM UP TIMER';
  currentConfig = { duration: 600 };

  configContent.innerHTML = `
    <div class="setting-row">
      <span class="setting-label">Duration</span>
      <div class="time-input">
        <input type="number" id="wu-min" value="10" min="0" max="99" onchange="updateWarmupConfig()">
        <span class="separator">:</span>
        <input type="number" id="wu-sec" value="00" min="0" max="59" onchange="updateWarmupConfig()">
      </div>
    </div>`;

  sendCommand('start-mode', { mode: 'warmup', config: currentConfig });
}

function updateWarmupConfig() {
  const min = parseInt(document.getElementById('wu-min')?.value, 10) || 0;
  const sec = parseInt(document.getElementById('wu-sec')?.value, 10) || 0;
  currentConfig.duration = min * 60 + sec;
  sendCommand('start-mode', { mode: 'warmup', config: currentConfig });
}

// Interval config
function showIntervalConfig() {
  configSection.style.display = 'block';
  configTitle.textContent = 'INTERVAL SETTINGS';
  currentConfig = { workTime: 60, restTime: 30, rounds: 10 };

  configContent.innerHTML = `
    <div class="setting-row">
      <span class="setting-label">Work Time</span>
      <div class="time-input">
        <input type="number" id="int-work-min" value="1" min="0" max="99" onchange="updateIntervalConfig()">
        <span class="separator">:</span>
        <input type="number" id="int-work-sec" value="00" min="0" max="59" onchange="updateIntervalConfig()">
      </div>
    </div>
    <div class="setting-row">
      <span class="setting-label">Rest Time</span>
      <div class="time-input">
        <input type="number" id="int-rest-min" value="0" min="0" max="99" onchange="updateIntervalConfig()">
        <span class="separator">:</span>
        <input type="number" id="int-rest-sec" value="30" min="0" max="59" onchange="updateIntervalConfig()">
      </div>
    </div>
    <div class="setting-row">
      <span class="setting-label">Rounds</span>
      <div class="setting-value">
        <button onclick="adjustInterval('rounds', -1)">−</button>
        <span id="int-rounds">10</span>
        <button onclick="adjustInterval('rounds', 1)">+</button>
      </div>
    </div>`;

  updateIntervalConfig();

  makeEditable('int-rounds', (val) => {
    currentConfig.rounds = val;
    sendCommand('start-mode', { mode: 'interval', config: currentConfig });
  }, 1, 99);
}

function adjustInterval(field, delta) {
  if (field === 'rounds') {
    currentConfig.rounds = Math.max(1, Math.min(99, currentConfig.rounds + delta));
    document.getElementById('int-rounds').textContent = currentConfig.rounds;
  }
  updateIntervalConfig();
}

function updateIntervalConfig() {
  const wMin = parseInt(document.getElementById('int-work-min')?.value, 10) || 0;
  const wSec = parseInt(document.getElementById('int-work-sec')?.value, 10) || 0;
  const rMin = parseInt(document.getElementById('int-rest-min')?.value, 10) || 0;
  const rSec = parseInt(document.getElementById('int-rest-sec')?.value, 10) || 0;

  currentConfig.workTime = wMin * 60 + wSec;
  currentConfig.restTime = rMin * 60 + rSec;

  sendCommand('start-mode', { mode: 'interval', config: currentConfig });
}

// Countdown config
function showCountdownConfig() {
  configSection.style.display = 'block';
  configTitle.textContent = 'COUNTDOWN TIMER';
  currentConfig = { duration: 300 };

  configContent.innerHTML = `
    <div class="setting-row">
      <span class="setting-label">Duration</span>
      <div class="time-input">
        <input type="number" id="cd-min" value="5" min="0" max="99" onchange="updateCountdownConfig()">
        <span class="separator">:</span>
        <input type="number" id="cd-sec" value="00" min="0" max="59" onchange="updateCountdownConfig()">
      </div>
    </div>`;

  sendCommand('start-mode', { mode: 'countdown', config: currentConfig });
}

function updateCountdownConfig() {
  const min = parseInt(document.getElementById('cd-min')?.value, 10) || 0;
  const sec = parseInt(document.getElementById('cd-sec')?.value, 10) || 0;
  currentConfig.duration = min * 60 + sec;
  sendCommand('start-mode', { mode: 'countdown', config: currentConfig });
}

// Count-up config
function showCountupConfig() {
  configSection.style.display = 'block';
  configTitle.textContent = 'COUNT UP TIMER';
  currentConfig = { duration: 0 };

  configContent.innerHTML = `
    <div class="setting-row">
      <span class="setting-label">Target (0 = unlimited)</span>
      <div class="time-input">
        <input type="number" id="cu-min" value="0" min="0" max="99" onchange="updateCountupConfig()">
        <span class="separator">:</span>
        <input type="number" id="cu-sec" value="00" min="0" max="59" onchange="updateCountupConfig()">
      </div>
    </div>`;

  sendCommand('start-mode', { mode: 'countup', config: currentConfig });
}

function updateCountupConfig() {
  const min = parseInt(document.getElementById('cu-min')?.value, 10) || 0;
  const sec = parseInt(document.getElementById('cu-sec')?.value, 10) || 0;
  currentConfig.duration = min * 60 + sec;
  sendCommand('start-mode', { mode: 'countup', config: currentConfig });
}

// Show presets
function showPresets() {
  presetsSection.style.display = 'block';
  presetList.innerHTML = '';

  PRESETS.forEach((preset) => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `
      <span class="preset-name">${preset.name}</span>
      <span class="preset-num">#${preset.id}</span>`;
    item.onclick = () => loadPreset(preset);
    presetList.appendChild(item);
  });
}

function loadPreset(preset) {
  if (preset.type === 'countdown') {
    selectMode('countdown');
    currentConfig = { duration: preset.duration };
    if (document.getElementById('cd-min')) {
      document.getElementById('cd-min').value = Math.floor(preset.duration / 60);
      document.getElementById('cd-sec').value = preset.duration % 60;
    }
    sendCommand('start-mode', { mode: 'countdown', config: currentConfig });
  } else if (preset.type === 'countup') {
    selectMode('countup');
    sendCommand('start-mode', { mode: 'countup', config: { duration: 0 } });
  } else {
    // Interval preset
    const config = {
      workTime: Array.isArray(preset.work) ? preset.work[0] : preset.work,
      restTime: preset.rest,
      rounds: preset.rounds,
    };
    if (Array.isArray(preset.work)) {
      config.workTimes = preset.work;
    }
    currentConfig = config;
    sendCommand('start-mode', { mode: 'interval', config });

    // Update UI
    configSection.style.display = 'block';
    configTitle.textContent = `PRESET #${preset.id}`;
    configContent.innerHTML = `
      <p style="color:#aaa; font-size:14px; line-height:1.6; padding:8px 0;">
        ${preset.name}<br>
        ${preset.rounds} rounds
      </p>`;
  }
}

// Start workout
// Device settings
function toggleSettings() {
  const body = document.getElementById('settings-body');
  const arrow = document.getElementById('settings-arrow');
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  arrow.classList.toggle('open', open);
}

function setBrightness(val) {
  document.getElementById('brightness-val').textContent = val;
  sendCommand('set-brightness', { level: parseInt(val, 10) });
}

function setVolume(val) {
  document.getElementById('volume-val').textContent = val;
  sendCommand('set-volume', { level: parseInt(val, 10) });
}

function toggle24hr() {
  sendCommand('toggle-24hr');
}

function togglePrep() {
  sendCommand('set-prep', { enabled: document.getElementById('toggle-prep').checked });
}

// Lap tracking (stopwatch)
let laps = [];
let lastLapTime = '0:00';

function recordLap() {
  const currentTime = ctrlTime.textContent.trim();
  const lapNum = laps.length + 1;
  const splitTime = currentTime; // Total time at this lap

  // Calculate split (difference from last lap)
  let split = currentTime;
  if (laps.length > 0) {
    const curr = parseTimeToMs(currentTime);
    const prev = parseTimeToMs(laps[laps.length - 1].total);
    split = formatLapTime(curr - prev);
  }

  laps.push({ num: lapNum, total: currentTime, split: split });
  lastLapTime = currentTime;
  renderLaps();
  sendCommand('lap', { num: lapNum, total: currentTime, split: split });

  // Send summary to display if 2+ laps
  if (laps.length >= 2) {
    const splitMs = laps.map(l => parseTimeToMs(l.split));
    const avg = splitMs.reduce((a, b) => a + b, 0) / splitMs.length;
    const best = Math.min(...splitMs);
    const bestLap = laps[splitMs.indexOf(best)];
    sendCommand('lap-summary', {
      avg: formatLapTime(avg),
      best: formatLapTime(best),
      bestNum: bestLap.num
    });
  }
}

function parseTimeToMs(timeStr) {
  // Handles M:SS.cc or H:MM:SS.cc
  let hundredths = 0;
  let main = timeStr;
  if (timeStr.includes('.')) {
    const [m, h] = timeStr.split('.');
    main = m;
    hundredths = parseInt(h, 10);
  }
  const parts = main.split(':').map(Number);
  let seconds;
  if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else seconds = parts[0] * 60 + parts[1];
  return seconds * 1000 + hundredths * 10;
}

function formatLapTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hundredths = Math.floor((ms % 1000) / 10);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function renderLaps() {
  const list = document.getElementById('lap-list');
  let html = laps.slice().reverse().map(lap =>
    `<div class="lap-row">
      <span class="lap-num">Lap ${lap.num}</span>
      <span class="lap-split">${lap.split}</span>
      <span class="lap-total">${lap.total}</span>
    </div>`
  ).join('');

  // Add summary if 2+ laps
  if (laps.length >= 2) {
    const splitMs = laps.map(lap => parseTimeToMs(lap.split));
    const avg = splitMs.reduce((a, b) => a + b, 0) / splitMs.length;
    const best = Math.min(...splitMs);
    const bestLap = laps[splitMs.indexOf(best)];
    html += `<div class="lap-summary">
      <div><span class="lap-summary-label">Avg</span> <span>${formatLapTime(avg)}</span></div>
      <div><span class="lap-summary-label">Best</span> <span class="lap-best">${formatLapTime(best)}</span> <span class="lap-summary-detail">(Lap ${bestLap.num})</span></div>
    </div>`;
  }

  list.innerHTML = html;
}

function clearLaps(btn) {
  if (btn && laps.length > 0) {
    if (btn.dataset.confirming === 'true') {
      clearTimeout(confirmTimer);
      btn.dataset.confirming = 'false';
      btn.textContent = 'CLEAR LAPS';
      btn.classList.remove('confirming');
    } else {
      btn.dataset.confirming = 'true';
      btn.textContent = 'SURE?';
      btn.classList.add('confirming');
      confirmTimer = setTimeout(() => {
        btn.dataset.confirming = 'false';
        btn.textContent = 'CLEAR LAPS';
        btn.classList.remove('confirming');
      }, 3000);
      return;
    }
  }
  laps = [];
  lastLapTime = '0:00';
  const list = document.getElementById('lap-list');
  if (list) list.innerHTML = '';
  sendCommand('clear-laps');
}

// Confirm destructive actions (Stop/Reset)
const instantStopModes = ['clock', 'stopwatch', 'countup'];
let confirmTimer = null;
function confirmAction(btn, action) {
  // Stop is instant on timing modes, Reset always confirms
  if (action === 'stop' && instantStopModes.includes(selectedMode)) {
    sendCommand(action);
    return;
  }
  if (btn.dataset.confirming === 'true') {
    clearTimeout(confirmTimer);
    btn.dataset.confirming = 'false';
    btn.textContent = action.toUpperCase();
    btn.classList.remove('confirming');
    sendCommand(action);
    return;
  }
  btn.dataset.confirming = 'true';
  btn.textContent = 'SURE?';
  btn.classList.add('confirming');
  confirmTimer = setTimeout(() => {
    btn.dataset.confirming = 'false';
    btn.textContent = action.toUpperCase();
    btn.classList.remove('confirming');
  }, 3000);
}

// Authentication
function attemptLogin() {
  const pw = loginPassword.value.trim();
  if (!pw) {
    loginError.textContent = 'Please enter a password';
    return;
  }
  loginError.textContent = '';
  socket.emit('auth', pw, (response) => {
    if (response.success) {
      authenticated = true;
      sessionStorage.setItem('coach-password', pw);
      loginOverlay.classList.add('hidden');
      selectMode('clock');
    } else {
      loginError.textContent = response.message || 'Incorrect password';
      loginPassword.value = '';
      loginPassword.focus();
    }
  });
}

// Allow Enter key to submit password
loginPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') attemptLogin();
});

// If server says we need auth (e.g. session expired), show login again
socket.on('auth-required', () => {
  authenticated = false;
  loginOverlay.classList.remove('hidden');
  loginError.textContent = 'Session expired. Please log in again.';
});

// Focus password field on load
loginPassword.focus();
