const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

const distPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map();

const PHASE_PAINT = 'paint';
const PHASE_HIDE = 'hide';
const PHASE_SEEK = 'seek';
const PHASE_RESULTS = 'results';
const PHASE_LOBBY = 'lobby';

const PAINT_TIME = 30;
const HIDE_TIME = 15;
const SEEK_TIME = 60;
const RESULTS_TIME = 10;

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(hostId, hostName) {
  let code = genCode();
  while (rooms.has(code)) code = genCode();
  const room = {
    code,
    host: hostId,
    phase: PHASE_LOBBY,
    players: new Map(),
    timer: null,
    timeLeft: 0,
    round: 0,
    seekerIndex: 0,
    mapIndex: 0,
    catches: new Map(),
  };
  rooms.set(code, room);
  return room;
}

function broadcastRoom(room) {
  const players = [];
  for (const [id, p] of room.players) {
    players.push({ id, name: p.name, ready: p.ready, isSeeker: p.isSeeker, caught: p.caught, score: p.score });
  }
  io.to(room.code).emit('room:state', {
    code: room.code,
    host: room.host,
    phase: room.phase,
    players,
    timeLeft: room.timeLeft,
    round: room.round,
    mapIndex: room.mapIndex,
  });
}

function startPhase(room, phase, duration) {
  room.phase = phase;
  room.timeLeft = duration;
  clearInterval(room.timer);
  broadcastRoom(room);

  room.timer = setInterval(() => {
    room.timeLeft--;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      advancePhase(room);
    } else {
      io.to(room.code).emit('room:tick', room.timeLeft);
    }
  }, 1000);
}

function advancePhase(room) {
  if (room.phase === PHASE_PAINT) {
    startPhase(room, PHASE_HIDE, HIDE_TIME);
  } else if (room.phase === PHASE_HIDE) {
    startPhase(room, PHASE_SEEK, SEEK_TIME);
  } else if (room.phase === PHASE_SEEK) {
    startPhase(room, PHASE_RESULTS, RESULTS_TIME);
  } else if (room.phase === PHASE_RESULTS) {
    const allCaught = [...room.players.values()].filter(p => !p.isSeeker).every(p => p.caught);
    room.round++;
    const playerIds = [...room.players.keys()];
    if (room.round >= playerIds.length) {
      room.phase = PHASE_LOBBY;
      room.round = 0;
      for (const p of room.players.values()) {
        p.ready = false;
        p.isSeeker = false;
        p.caught = false;
      }
      broadcastRoom(room);
    } else {
      startNewRound(room);
    }
  }
}

function startNewRound(room) {
  const playerIds = [...room.players.keys()];
  const seekerIdx = room.round % playerIds.length;

  for (const [id, p] of room.players) {
    p.isSeeker = false;
    p.caught = false;
    p.position = null;
    p.paintData = null;
  }

  const seekerId = playerIds[seekerIdx];
  room.players.get(seekerId).isSeeker = true;
  room.mapIndex = Math.floor(Math.random() * 6);
  room.catches = new Map();

  startPhase(room, PHASE_PAINT, PAINT_TIME);
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('room:create', (name, cb) => {
    const room = createRoom(socket.id, name);
    room.players.set(socket.id, { name, ready: false, isSeeker: false, caught: false, score: 0, position: null, paintData: null });
    socket.join(room.code);
    currentRoom = room.code;
    cb({ ok: true, code: room.code });
    broadcastRoom(room);
  });

  socket.on('room:join', (code, name, cb) => {
    code = code.toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: 'Room not found' });
    if (room.phase !== PHASE_LOBBY) return cb({ ok: false, error: 'Game in progress' });
    if (room.players.size >= 8) return cb({ ok: false, error: 'Room full' });

    room.players.set(socket.id, { name, ready: false, isSeeker: false, caught: false, score: 0, position: null, paintData: null });
    socket.join(code);
    currentRoom = code;
    cb({ ok: true, code });
    broadcastRoom(room);
  });

  socket.on('room:ready', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (player) player.ready = !player.ready;
    broadcastRoom(room);
  });

  socket.on('game:start', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.host !== socket.id) return;
    if (room.players.size < 2) return;
    room.round = 0;
    startNewRound(room);
  });

  socket.on('paint:stroke', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.phase !== PHASE_PAINT) return;
    const player = room.players.get(socket.id);
    if (!player || player.isSeeker) return;
    socket.to(currentRoom).emit('paint:stroke', { playerId: socket.id, ...data });
  });

  socket.on('player:position', (pos) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (player) player.position = pos;
    socket.to(currentRoom).emit('player:moved', { id: socket.id, ...pos });
  });

  socket.on('player:hide', (pos) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.phase !== PHASE_HIDE) return;
    const player = room.players.get(socket.id);
    if (player && !player.isSeeker) {
      player.position = pos;
    }
  });

  socket.on('seek:catch', (targetId) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.phase !== PHASE_SEEK) return;
    const seeker = room.players.get(socket.id);
    const target = room.players.get(targetId);
    if (!seeker || !seeker.isSeeker || !target || target.isSeeker || target.caught) return;

    target.caught = true;
    seeker.score += 100;
    target.score += Math.max(0, room.timeLeft * 5);
    io.to(currentRoom).emit('seek:caught', { seekerId: socket.id, targetId, timeLeft: room.timeLeft });
    broadcastRoom(room);

    const allCaught = [...room.players.values()].filter(p => !p.isSeeker).every(p => p.caught);
    if (allCaught) {
      clearInterval(room.timer);
      seeker.score += room.timeLeft * 10;
      startPhase(room, PHASE_RESULTS, RESULTS_TIME);
    }
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.players.delete(socket.id);
    if (room.players.size === 0) {
      clearInterval(room.timer);
      rooms.delete(currentRoom);
    } else {
      if (room.host === socket.id) {
        room.host = room.players.keys().next().value;
      }
      broadcastRoom(room);
    }
  });
});

const PORT = process.env.PORT || 3456;
server.listen(PORT, () => console.log(`Hide & Shoot server on :${PORT}`));
