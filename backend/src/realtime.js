const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pos_secret_key_2024';

let io = null;

/**
 * Initialize Socket.io on the HTTP server
 */
function initRealtime(httpServer, corsOptions) {
  io = new Server(httpServer, {
    cors: corsOptions || {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // Optional Authentication middleware
  io.use((socket, next) => {
    try {
      let token = null;

      // 1. Check cookies in handshake
      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        const cookies = parseCookies(cookieHeader);
        if (cookies.pos_session) {
          token = cookies.pos_session;
        }
      }

      // 2. Fallback to auth payload
      if (!token && socket.handshake.auth && socket.handshake.auth.token) {
        token = socket.handshake.auth.token;
      }

      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          socket.user = decoded;
        } catch (e) {
          // Token invalid, allow connection as guest or unauthenticated
          socket.user = null;
        }
      } else {
        socket.user = null;
      }

      return next();
    } catch (err) {
      return next();
    }
  });

  io.on('connection', (socket) => {
    const userLabel = socket.user ? `${socket.user.name} (${socket.user.role})` : 'Anonymous';
    console.log(`🔌 [Realtime] Client connected: ${socket.id} - ${userLabel}`);

    if (socket.user && socket.user.id) {
      socket.join(`user:${socket.user.id}`);
      socket.join(`role:${socket.user.role}`);
    }

    // Ping / pong heartbeat or custom echo
    socket.on('ping:client', (cb) => {
      if (typeof cb === 'function') cb({ time: Date.now(), id: socket.id });
    });

    // Mobile Barcode Scanner relay -> Send to POS screens
    socket.on('pos:scan', (data) => {
      console.log(`📱 [Scanner Relay] Barcode ${data?.barcode} from ${userLabel}`);
      io.emit('pos:scanned', {
        ...data,
        sender: socket.user?.name || 'มือถือ (Mobile)',
        timestamp: Date.now(),
      });
    });

    // POS Cart Sync between devices
    socket.on('pos:cart_sync', (data) => {
      socket.broadcast.emit('pos:cart_synced', {
        ...data,
        sender: socket.user?.name,
      });
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 [Realtime] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

/**
 * Parse raw cookie string from HTTP headers
 */
function parseCookies(str) {
  const list = {};
  if (!str) return list;
  str.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

/**
 * Broadcast an event to all connected clients
 */
function emitEvent(event, data) {
  if (io) {
    io.emit(event, {
      ...data,
      _timestamp: Date.now(),
    });
  }
}

/**
 * Emit event to a specific user
 */
function emitToUser(userId, event, data) {
  if (io) {
    io.to(`user:${userId}`).emit(event, {
      ...data,
      _timestamp: Date.now(),
    });
  }
}

/**
 * Emit event to a specific role (e.g. 'admin', 'storekeeper')
 */
function emitToRole(role, event, data) {
  if (io) {
    io.to(`role:${role}`).emit(event, {
      ...data,
      _timestamp: Date.now(),
    });
  }
}

function getIO() {
  return io;
}

module.exports = {
  initRealtime,
  emitEvent,
  emitToUser,
  emitToRole,
  getIO,
};
