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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send current state to newly connected client
  socket.emit('state-sync', timerState);

  // Authentication
  socket.on('auth', (password, callback) => {
    if (password === COACH_PASSWORD) {
      authenticatedSockets.add(socket.id);
      console.log(`Client authenticated: ${socket.id}`);
      // Notify all clients (especially display) that a controller is connected
      io.emit('controller-connected', { count: authenticatedSockets.size });
      callback({ success: true });
    } else {
      console.log(`Auth failed: ${socket.id}`);
      callback({ success: false, message: 'Incorrect password' });
    }
  });

  // Controller sends a command — require auth
  socket.on('command', (data) => {
    if (!authenticatedSockets.has(socket.id)) {
      socket.emit('auth-required');
      return;
    }
    console.log('Command received:', data.action);
    io.emit('command', data);
  });

  // State update from the authoritative timer (display)
  socket.on('state-update', (state) => {
    timerState = { ...timerState, ...state };
    socket.broadcast.emit('state-sync', timerState);
  });

  socket.on('disconnect', () => {
    authenticatedSockets.delete(socket.id);
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
