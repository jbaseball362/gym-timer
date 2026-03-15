const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const COACH_PASSWORD = process.env.COACH_PASSWORD || 'coach123';

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API to get the control URL (used by display page for QR code)
app.get('/api/info', (req, res) => {
  const ip = getLocalIP();
  res.json({
    controlUrl: `http://${ip}:${PORT}/control`,
    displayUrl: `http://${ip}:${PORT}`,
  });
});

// Display page (for the TV)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// Controller page (for the phone)
app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

// Timer state shared across all clients
let timerState = {
  mode: 'clock',
  status: 'stopped',
  displayTime: '00:00',
  phase: 'work',
  currentRound: 0,
  totalRounds: 0,
  brightness: 5,
  volume: 3,
  use24hr: false,
  prepCountdown: true,
  workTime: 0,
  restTime: 0,
};

// Track authenticated sockets
const authenticatedSockets = new Set();

// Track display sockets (non-controller connections)
const displaySockets = new Set();

// Rate limiting for auth attempts
const authAttempts = new Map(); // ip -> { count, lastAttempt }
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_LOCKOUT_MS = 60 * 1000; // 1 minute lockout

// Valid command actions whitelist
const VALID_ACTIONS = new Set([
  'start-mode', 'play', 'pause', 'stop', 'reset',
  'lap', 'lap-summary', 'clear-laps',
  'toggle-24hr', 'set-brightness', 'set-volume', 'set-prep',
  'test-sound', 'server-shutdown',
]);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send current state to newly connected client
  socket.emit('state-sync', timerState);

  // Authentication with rate limiting
  socket.on('auth', (password, callback) => {
    const ip = socket.handshake.address;
    const now = Date.now();
    const attempts = authAttempts.get(ip) || { count: 0, lastAttempt: 0 };

    // Reset counter if lockout period has passed
    if (now - attempts.lastAttempt > AUTH_LOCKOUT_MS) {
      attempts.count = 0;
    }

    // Check if locked out
    if (attempts.count >= MAX_AUTH_ATTEMPTS) {
      const remaining = Math.ceil((AUTH_LOCKOUT_MS - (now - attempts.lastAttempt)) / 1000);
      console.log(`Auth rate-limited: ${ip} (${remaining}s remaining)`);
      callback({ success: false, message: `Too many attempts. Try again in ${remaining}s` });
      return;
    }

    if (password === COACH_PASSWORD) {
      authAttempts.delete(ip);
      authenticatedSockets.add(socket.id);
      displaySockets.delete(socket.id);
      console.log(`Client authenticated: ${socket.id}`);
      // Notify all clients (especially display) that a controller is connected
      io.emit('controller-connected', { count: authenticatedSockets.size });
      callback({ success: true });
    } else {
      attempts.count++;
      attempts.lastAttempt = now;
      authAttempts.set(ip, attempts);
      console.log(`Auth failed: ${socket.id} (attempt ${attempts.count}/${MAX_AUTH_ATTEMPTS})`);
      callback({ success: false, message: 'Incorrect password' });
    }
  });

  // Controller sends a command — require auth + validate action
  socket.on('command', (data) => {
    if (!authenticatedSockets.has(socket.id)) {
      socket.emit('auth-required');
      return;
    }
    if (!data || !VALID_ACTIONS.has(data.action)) {
      console.log(`Invalid command rejected: ${data?.action}`);
      return;
    }
    console.log('Command received:', data.action);
    io.emit('command', data);
  });

  // State update from the authoritative timer (display only)
  socket.on('state-update', (state) => {
    if (authenticatedSockets.has(socket.id)) {
      return; // Controllers can't overwrite display state
    }
    displaySockets.add(socket.id);
    timerState = { ...timerState, ...state };
    socket.broadcast.emit('state-sync', timerState);
  });

  socket.on('disconnect', () => {
    authenticatedSockets.delete(socket.id);
    displaySockets.delete(socket.id);
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Get the first non-internal IPv4 address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\n  Gym Timer is running!\n`);
  console.log(`  TV Display:       http://${ip}:${PORT}`);
  console.log(`  Phone Controller: http://${ip}:${PORT}/control`);
  console.log(`  Coach Password:   ${COACH_PASSWORD}`);
  console.log(`\n  Set a custom password: COACH_PASSWORD=yourpass npm start\n`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n  ${signal} received — shutting down...`);
  io.emit('command', { action: 'server-shutdown' });
  io.close(() => {
    server.close(() => {
      console.log('  Gym Timer stopped.\n');
      process.exit(0);
    });
  });
  // Force exit if cleanup takes too long
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
