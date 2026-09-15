import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Get dynamic server URL for Socket.io
 * In Vite dev (5173), connect directly to backend (3001) to bypass HMR proxy dropouts on mobile!
 */
export function getSocketUrl(): string {
  if (typeof window === 'undefined') return '/';
  if (window.location.port === '5173') {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return window.location.origin;
}

/**
 * Get or initialize the Socket.io client
 */
export function getSocket(): Socket {
  if (!socket) {
    const serverUrl = getSocketUrl();
    socket = io(serverUrl, {
      path: '/socket.io',
      auth: (cb) => {
        const token = localStorage.getItem('pos_token');
        cb({ token });
      },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('⚡ [Realtime] Connected to server, ID:', socket?.id, 'URL:', serverUrl);
    });

    socket.on('connect_error', (err) => {
      console.warn('⚠️ [Realtime] Connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('⚡ [Realtime] Disconnected:', reason);
    });
  }

  return socket;
}

/**
 * Force reconnect socket (e.g. after login or network reconnect)
 */
export function reconnectSocket() {
  if (socket) {
    socket.disconnect().connect();
  } else {
    getSocket();
  }
}

/**
 * Relay barcode scan from mobile to active POS registers
 */
export function emitBarcodeScan(barcode: string) {
  const s = getSocket();
  if (s) {
    s.emit('pos:scan', { barcode });
  }
}

/**
 * React hook to listen to real-time events
 */
export function useRealtimeEvent<T = any>(event: string, handler: (data: T) => void) {
  useEffect(() => {
    const s = getSocket();
    s.on(event, handler);

    return () => {
      s.off(event, handler);
    };
  }, [event, handler]);
}

/**
 * React hook to monitor real-time connection status
 */
export function useRealtimeStatus() {
  const [connected, setConnected] = useState<boolean>(() => {
    return socket ? socket.connected : false;
  });

  useEffect(() => {
    const s = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    if (s.connected) {
      setConnected(true);
    }

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return connected;
}
