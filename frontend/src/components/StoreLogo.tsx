import { useState } from 'react';
import {
  Store, ShoppingBag, Coffee, Utensils, Package,
  Sparkles, Boxes, BadgePercent, Layers, type LucideIcon
} from 'lucide-react';
import type { LogoConfig } from '../stores/settingsStore';

export const ICON_MAP: Record<string, LucideIcon> = {
  Store,
  ShoppingBag,
  Coffee,
  Utensils,
  Package,
  Sparkles,
  Boxes,
  BadgePercent,
  Layers,
};

interface StoreLogoProps {
  logo?: Partial<LogoConfig>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export default function StoreLogo({ logo, size = 'md', className = '' }: StoreLogoProps) {
  const [imgError, setImgError] = useState(false);

  const effectiveType = logo?.type || 'icon';
  const effectiveImageUrl = logo?.image_url;
  const iconName = logo?.icon_name || 'Store';
  const IconComponent = ICON_MAP[iconName] || Store;

  const iconColor = logo?.icon_color || '#60a5fa';
  const bgColor = logo?.bg_color || 'rgba(37, 99, 235, 0.2)';
  const borderColor = logo?.border_color || 'rgba(59, 130, 246, 0.3)';
  const shape = logo?.shape || 'rounded-xl';

  // Dimensions based on size
  const sizeMap = {
    sm: { box: 'w-8 h-8', icon: 18 },
    md: { box: 'w-9 h-9', icon: 20 },
    lg: { box: 'w-11 h-11', icon: 25 },
    xl: { box: 'w-14 h-14', icon: 32 },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  if (effectiveType === 'image' && effectiveImageUrl && !imgError) {
    return (
      <div
        className={`${currentSize.box} ${shape} flex items-center justify-center flex-shrink-0 overflow-hidden border transition-all ${className}`}
        style={{ backgroundColor: bgColor, borderColor: borderColor }}
      >
        <img
          src={effectiveImageUrl}
          alt="Store Logo"
          onError={() => setImgError(true)}
          className="w-full h-full object-contain p-0.5"
        />
      </div>
    );
  }

  return (
    <div
      className={`${currentSize.box} ${shape} flex items-center justify-center flex-shrink-0 border transition-all ${className}`}
      style={{ backgroundColor: bgColor, borderColor: borderColor }}
    >
      <IconComponent size={currentSize.icon} style={{ color: iconColor }} />
    </div>
  );
}
