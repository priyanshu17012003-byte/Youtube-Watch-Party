import express from 'express';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import { nanoid } from 'nanoid';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const roles = {
  HOST: 'Host',
  MODERATOR: 'Moderator',
  PARTICIPANT: 'Participant'
};

class Participant {
  constructor({ id, username, socketId, role }) {
    this.id = id;
    this.username = username;
    this.socketId = socketId;
    this.role = role;
  }
}

class WatchRoom {
  constructor({ id, hostName }) {
    this.id = id;
    this.createdAt = new Date().toISOString();
    this.state = {
      videoId: 'dQw4w9WgXcQ',
      playState: 'paused',
      currentTime: 0,
      updatedAt: Date.now()
    };
    this.participants = new Map();
    this.pendingHostName = hostName;
  }

  addParticipant({ socketId, username }) {
    const isFirstUser = this.participants.size === 0;
    const participant = new Participant({
      id: nanoid(10),
      username,
      socketId,
      role: isFirstUser ? roles.HOST : roles.PARTICIPANT
    });

    this.participants.set(participant.id, participant);
    return participant;
  }

  removeParticipant(userId) {
    const participant = this.participants.get(userId);
    if (!participant) return null;

    this.participants.delete(userId);
    if (participant.role === roles.HOST && this.participants.size > 0) {
      const nextHost = this.participants.values().next().value;
      nextHost.role = roles.HOST;
    }

    return participant;
  }

  removeBySocket(socketId) {
    const participant = [...this.participants.values()].find((user) => user.socketId === socketId);
    if (!participant) return null;
    return this.removeParticipant(participant.id);
  }

  getParticipant(userId) {
    return this.participants.get(userId);
  }

  hasPermission(userId, action) {
    const participant = this.getParticipant(userId);
    if (!participant) return false;
    if (action === 'host') return participant.role === roles.HOST;
    if (action === 'control') return participant.role === roles.HOST;
    return false;
  }

  assignRole(userId, role) {
    const participant = this.getParticipant(userId);
    if (!participant || !Object.values(roles).includes(role)) return null;
    participant.role = role;
    return participant;
  }

  transferHost(newHostId) {
    const nextHost = this.getParticipant(newHostId);
    if (!nextHost) return null;

    for (const participant of this.participants.values()) {
      if (participant.role === roles.HOST) {
        participant.role = roles.PARTICIPANT;
      }
    }

    nextHost.role = roles.HOST;
    return nextHost;
  }

  setPlayback(patch) {
    this.state = {
      ...this.state,
      ...patch,
      updatedAt: Date.now()
    };
    return this.state;
  }

  participantList() {
    return [...this.participants.values()].map(({ id, username, role }) => ({
      id,
      username,
      role
    }));
  }
}

class RoomStore {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(hostName) {
    const room = new WatchRoom({ id: nanoid(7), hostName });
    this.rooms.set(room.id, room);
    return room;
  }

  get(roomId) {
    return this.rooms.get(roomId);
  }

  deleteIfEmpty(roomId) {
    const room = this.get(roomId);
    if (room && room.participants.size === 0) {
      this.rooms.delete(roomId);
    }
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST']
  }
});
const roomStore = new RoomStore();

app.use(express.json());

app.post('/api/rooms', (req, res) => {
  const hostName = cleanName(req.body?.username);
  const room = roomStore.createRoom(hostName);
  res.status(201).json({ roomId: room.id });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const clientDist = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (error) => {
    if (error) res.status(404).send('Run npm run build before production start.');
  });
});

io.on('connection', (socket) => {
  socket.data.userId = null;
  socket.data.roomId = null;

  socket.on('join_room', ({ roomId, username }, ack) => {
    const room = roomStore.get(roomId);
    if (!room) return ack?.({ ok: false, message: 'Room not found.' });

    const participant = room.addParticipant({
      socketId: socket.id,
      username: cleanName(username)
    });

    socket.data.userId = participant.id;
    socket.data.roomId = roomId;
    socket.join(roomId);

    const payload = {
      currentUser: { id: participant.id, username: participant.username, role: participant.role },
      participants: room.participantList(),
      state: room.state
    };

    ack?.({ ok: true, ...payload });
    io.to(roomId).emit('user_joined', {
      username: participant.username,
      userId: participant.id,
      role: participant.role,
      participants: room.participantList()
    });
    socket.emit('sync_state', room.state);
  });

  socket.on('play', (_payload, ack) => handleControl(socket, ack, (room) => {
    broadcastState(room, room.setPlayback({ playState: 'playing' }));
  }));

  socket.on('pause', (_payload, ack) => handleControl(socket, ack, (room) => {
    broadcastState(room, room.setPlayback({ playState: 'paused' }));
  }));

  socket.on('seek', ({ time }, ack) => handleControl(socket, ack, (room) => {
    const safeTime = Math.max(0, Number(time) || 0);
    broadcastState(room, room.setPlayback({ currentTime: safeTime }));
  }));

  socket.on('change_video', ({ videoId }, ack) => handleControl(socket, ack, (room) => {
    const nextVideoId = extractYouTubeId(videoId);
    if (!nextVideoId) return ack?.({ ok: false, message: 'Paste a valid YouTube URL or video ID.' });
    broadcastState(room, room.setPlayback({ videoId: nextVideoId, currentTime: 0, playState: 'paused' }));
  }));

  socket.on('assign_role', ({ userId, role }, ack) => handleHost(socket, ack, (room) => {
    if (role === roles.HOST) {
      room.transferHost(userId);
    } else {
      room.assignRole(userId, role);
    }

    io.to(room.id).emit('role_assigned', {
      userId,
      role,
      participants: room.participantList()
    });
    ack?.({ ok: true });
  }));

  socket.on('remove_participant', ({ userId }, ack) => handleHost(socket, ack, (room) => {
    const removed = room.removeParticipant(userId);
    if (!removed) return ack?.({ ok: false, message: 'Participant not found.' });

    const removedSocket = io.sockets.sockets.get(removed.socketId);
    removedSocket?.leave(room.id);
    removedSocket?.emit('participant_removed', {
      userId,
      participants: room.participantList(),
      message: 'The host removed you from the room.'
    });

    io.to(room.id).emit('participant_removed', {
      userId,
      participants: room.participantList()
    });
    ack?.({ ok: true });
  }));

  socket.on('chat_message', ({ message }, ack) => {
    const room = currentRoom(socket);
    const sender = room?.getParticipant(socket.data.userId);
    const text = String(message || '').trim().slice(0, 240);
    if (!room || !sender || !text) return ack?.({ ok: false });

    io.to(room.id).emit('chat_message', {
      id: nanoid(8),
      userId: sender.id,
      username: sender.username,
      role: sender.role,
      message: text,
      createdAt: new Date().toISOString()
    });
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const room = currentRoom(socket);
    if (!room) return;

    const removed = room.removeBySocket(socket.id);
    if (!removed) return;

    io.to(room.id).emit('user_left', {
      username: removed.username,
      userId: removed.id,
      participants: room.participantList()
    });
    roomStore.deleteIfEmpty(room.id);
  });
});

function currentRoom(socket) {
  return roomStore.get(socket.data.roomId);
}

function handleControl(socket, ack, onAllowed) {
  const room = currentRoom(socket);
  if (!room || !room.hasPermission(socket.data.userId, 'control')) {
    return ack?.({ ok: false, message: 'Only the host can control playback.' });
  }
  onAllowed(room);
  ack?.({ ok: true });
}

function handleHost(socket, ack, onAllowed) {
  const room = currentRoom(socket);
  if (!room || !room.hasPermission(socket.data.userId, 'host')) {
    return ack?.({ ok: false, message: 'Only the host can manage participants.' });
  }
  onAllowed(room);
}

function broadcastState(room, state) {
  io.to(room.id).emit('sync_state', state);
}

function cleanName(value) {
  return String(value || 'Guest').trim().slice(0, 32) || 'Guest';
}

function extractYouTubeId(input) {
  const value = String(input || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

  try {
    const url = new URL(value);
    if (url.hostname.includes('youtu.be')) return url.pathname.replace('/', '').slice(0, 11);
    if (url.searchParams.get('v')) return url.searchParams.get('v').slice(0, 11);
    const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    return embedMatch?.[1] || null;
  } catch {
    return null;
  }
}

server.listen(PORT, () => {
  console.log(`Watch Party server running on http://localhost:${PORT}`);
});
