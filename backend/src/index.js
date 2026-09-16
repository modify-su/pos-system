require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { initializeDatabase } = require('./db/database');
const { initRealtime } = require('./realtime');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for reverse proxies (Nginx, Cloudflare, Heroku, Docker)
app.set('trust proxy', 1);

// CORS configuration supporting credentials (cookies) and multiple origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : [];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow server-to-server, mobile native apps, or requests without Origin header
    if (!origin) return callback(null, true);
    if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In local development or LAN, allow any localhost or local IP
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(null, true); // Permissive for initial hosting setup
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};

// Middleware
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
const uploadsPath = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/reports', require('./routes/reports'));

const os = require('os');

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Health check
app.get('/api/health', (req, res) => {
  const localIp = getLocalIP();
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    version: '1.0.0',
    localIp,
    port: PORT,
    lanUrl: `http://${localIp}:${PORT}`,
    env: process.env.NODE_ENV || 'development',
  });
});

// Serve frontend static build in production or when dist exists
const frontendDist = process.env.FRONTEND_DIST ? path.resolve(process.env.FRONTEND_DIST) : path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads') && !req.path.startsWith('/socket.io')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    next();
  });
}

// 404 for unmatched API routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

// Create HTTP server for both Express and Socket.io
const server = http.createServer(app);

// Attach Socket.io
initRealtime(server, corsOptions);

// Start
initializeDatabase()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 POS Backend & Realtime running at http://localhost:${PORT} and http://0.0.0.0:${PORT}`);
      console.log(`📦 Health: http://localhost:${PORT}/api/health`);
      console.log(`🔌 WebSockets: ws://localhost:${PORT}/socket.io/\n`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = { app, server };
