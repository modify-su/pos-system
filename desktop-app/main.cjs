const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { fork } = require('child_process');

let mainWindow = null;
let backendProcess = null;
const BACKEND_PORT = 3001;
const APP_URL = `http://localhost:${BACKEND_PORT}`;

// Single Instance Lock: prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

/**
 * Check if the backend server is responding on localhost:3001
 */
function checkBackendHealth(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(`${APP_URL}/api/health`, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Start the backend server if not already running
 */
async function ensureBackendRunning() {
  const isHealthy = await checkBackendHealth();
  if (isHealthy) {
    console.log('✅ Backend server is already running on port', BACKEND_PORT);
    return;
  }

  console.log('🚀 Starting embedded backend server...');

  let backendPath;
  let frontendDistPath;
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'pos.db');
  const uploadsPath = path.join(userDataPath, 'uploads');

  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.resolve(__dirname, '../backend');

  backendPath = path.join(backendDir, 'src', 'index.js');
  frontendDistPath = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'dist')
    : path.resolve(__dirname, '../frontend/dist');

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }

  // Load backend/.env if present so DATABASE_URL / secrets are passed through
  const envFile = path.join(backendDir, '.env');
  const loadedEnv = {};
  if (fs.existsSync(envFile)) {
    try {
      const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim();
          loadedEnv[k] = v;
        }
      }
    } catch (e) {
      console.warn('Could not read backend .env:', e.message);
    }
  }

  // If fresh install or existing db is empty, copy initial pos.db template if available
  const templateDb = path.join(backendDir, 'pos.db');
  let shouldCopyTemplate = !fs.existsSync(dbPath);
  if (!shouldCopyTemplate && fs.existsSync(templateDb)) {
    try {
      const dbStat = fs.statSync(dbPath);
      const templateStat = fs.statSync(templateDb);
      if (dbStat.size < templateStat.size / 2) {
        shouldCopyTemplate = true;
      }
    } catch (_) {}
  }
  if (shouldCopyTemplate && fs.existsSync(templateDb)) {
    try {
      fs.copyFileSync(templateDb, dbPath);
      console.log('📦 Initialized default database at:', dbPath);
    } catch (e) {
      console.warn('Could not copy template db, will initialize fresh:', e.message);
    }
  }

  backendProcess = fork(backendPath, [], {
    cwd: backendDir,
    env: {
      ...process.env,
      ...loadedEnv,
      PORT: String(BACKEND_PORT),
      NODE_ENV: 'production',
      DB_PATH: dbPath,
      UPLOADS_DIR: uploadsPath,
      FRONTEND_DIST: frontendDistPath,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: 'inherit',
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend process:', err);
  });

  // Wait for the server to be ready
  const maxRetries = 25;
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, 600));
    const ready = await checkBackendHealth();
    if (ready) {
      console.log('✅ Backend server is ready!');
      return;
    }
  }

  throw new Error('ไม่สามารถเริ่มการทำงานของเซิร์ฟเวอร์ฐานข้อมูลได้ (Timeout)');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'Smart POS & Warehouse System',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await ensureBackendRunning();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (err) {
    dialog.showErrorBox('เกิดข้อผิดพลาดในการเปิดระบบ', err.message || String(err));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (backendProcess) {
    console.log('🛑 Stopping embedded backend server...');
    try {
      backendProcess.kill();
    } catch { /* ignore */ }
    backendProcess = null;
  }
});
