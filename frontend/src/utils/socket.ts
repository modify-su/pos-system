import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Get or initialize the Socket.io client
 */
export function getSocket(): Socket {
  if (!socket) {
    // Connect to current origin, which proxies through Vite in dev, or directly on production host
    socket = io('/', {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('⚡ [Realtime] Connected to server, ID:', socket?.id);
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
