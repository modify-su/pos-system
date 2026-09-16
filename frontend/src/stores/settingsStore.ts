import { create } from 'zustand';
import api from '../api/client';

export interface LogoConfig {
  type: 'icon' | 'image';
  image_url: string;
  icon_name: string;
  icon_color: string;
  bg_color: string;
  border_color: string;
  size: 'sm' | 'md' | 'lg' | 'xl';
  shape: 'rounded-xl' | 'rounded-full' | 'rounded-lg' | 'rounded-none';
  store_name: string;
  store_slogan: string;
}

export interface StoreInfo {
  name: string;
  phone: string;
  address: string;
  tax_id: string;
  receipt_footer: string;
  logo: LogoConfig;
}

export const DEFAULT_STORE_INFO: StoreInfo = {
  name: 'Smart POS & Warehouse',
  phone: '',
  address: '',
  tax_id: '',
  receipt_footer: 'ขอบคุณที่ใช้บริการ',
  logo: {
    type: 'icon',
    image_url: '',
    icon_name: 'Store',
    icon_color: '#60a5fa',
    bg_color: 'rgba(37, 99, 235, 0.2)',
    border_color: 'rgba(59, 130, 246, 0.3)',
    size: 'md',
    shape: 'rounded-xl',
    store_name: 'POS System',
    store_slogan: 'ระบบจัดการร้านค้า',
  },
};

interface SettingsStore {
  storeInfo: StoreInfo;
  loading: boolean;
  fetchStoreInfo: () => Promise<void>;
  updateStoreInfo: (info: Partial<StoreInfo>) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  storeInfo: DEFAULT_STORE_INFO,
  loading: false,
  fetchStoreInfo: async () => {
    try {
      set({ loading: true });
      const res = await api.get('/settings/store');
      if (res.data) {
        set({
          storeInfo: {
            ...DEFAULT_STORE_INFO,
            ...res.data,
            logo: {
              ...DEFAULT_STORE_INFO.logo,
              ...(res.data.logo || {}),
              store_name: res.data.logo?.store_name || res.data.name || DEFAULT_STORE_INFO.logo.store_name,
            },
          },
        });
      }
    } catch (err) {
      console.error('Failed to load store settings:', err);
    } finally {
      set({ loading: false });
    }
  },
  updateStoreInfo: (info) => {
    set((state) => ({
      storeInfo: {
        ...state.storeInfo,
        ...info,
        logo: {
          ...state.storeInfo.logo,
          ...(info.logo || {}),
        },
      },
    }));
  },
}));
