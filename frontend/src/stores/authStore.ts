import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/client';

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'cashier' | 'storekeeper' | string;
  permissions?: string[];
}

interface AuthStore {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<boolean>;
  isAuthenticated: () => boolean;
  hasPermission: (key: string) => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,
      login: async (username, password) => {
        const { data } = await api.post('/auth/login', { username, password });
        // Cookie is set automatically via Set-Cookie header
        if (data.token) {
          localStorage.setItem('pos_token', data.token);
        }
        set({ user: data.user, token: data.token });
      },
      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // Ignore network errors on logout
        } finally {
          localStorage.removeItem('pos_token');
          set({ user: null, token: null });
        }
      },
      checkSession: async () => {
        try {
          set({ loading: true });
          const { data } = await api.get('/auth/me');
          if (data && data.id) {
            set({ user: data, loading: false });
            return true;
          }
          set({ user: null, token: null, loading: false });
          return false;
        } catch {
          set({ user: null, token: null, loading: false });
          return false;
        }
      },
      isAuthenticated: () => !!get().user || !!get().token,
      hasPermission: (key: string) => {
        const user = get().user;
        if (!user) return false;
        if (user.role === 'admin') return true;
        if (user.permissions && Array.isArray(user.permissions)) {
          return user.permissions.includes(key);
        }
        // Default fallback
        if (user.role === 'cashier') return ['dashboard', 'pos', 'stock-out'].includes(key);
        if (user.role === 'storekeeper') return ['dashboard', 'inventory', 'stock-in', 'stock-out'].includes(key);
        return key === 'dashboard';
      },
    }),
    {
      name: 'pos_auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);
