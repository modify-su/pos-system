import { useState, type CSSProperties } from 'react';
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

  const toneStyle = logo?.tone_style || 'soft';
  const glowEffect = logo?.glow_effect || 'none';
  const shadowEffect = logo?.shadow_effect || 'none';
  const borderWidth = logo?.border_width || 'thin';
  const gradientColor = logo?.gradient_color || '#1e293b';
  const glowColor = logo?.glow_color || logo?.icon_color || '#3b82f6';

  // Normalize glow color for hex alpha if needed
  const normalizedGlow = glowColor.startsWith('#')
    ? (glowColor.length === 4
        ? `#${glowColor[1]}${glowColor[1]}${glowColor[2]}${glowColor[2]}${glowColor[3]}${glowColor[3]}`
        : glowColor)
    : glowColor;

  // Build box-shadow string combining glow and 3D shadow
  const shadowParts: string[] = [];
  if (glowEffect === 'soft') {
    shadowParts.push(`0 0 12px ${normalizedGlow.startsWith('#') ? `${normalizedGlow}50` : 'rgba(59, 130, 246, 0.35)'}`);
  } else if (glowEffect === 'vibrant') {
    shadowParts.push(
      `0 0 16px ${normalizedGlow.startsWith('#') ? `${normalizedGlow}85` : 'rgba(59, 130, 246, 0.55)'}`,
      `0 0 4px ${normalizedGlow.startsWith('#') ? normalizedGlow : 'rgba(59, 130, 246, 0.9)'}`
    );
  } else if (glowEffect === 'aura') {
    shadowParts.push(
      `0 0 25px ${normalizedGlow.startsWith('#') ? `${normalizedGlow}99` : 'rgba(59, 130, 246, 0.65)'}`,
      `0 0 8px ${normalizedGlow.startsWith('#') ? normalizedGlow : 'rgba(59, 130, 246, 1)'}`
    );
  }

  if (shadowEffect === 'soft') {
    shadowParts.push('0 3px 6px -1px rgba(0, 0, 0, 0.25)');
  } else if (shadowEffect === 'elevated') {
    shadowParts.push('0 8px 16px -2px rgba(0, 0, 0, 0.4)', '0 4px 6px -2px rgba(0, 0, 0, 0.25)');
  }

  const boxShadow = shadowParts.length > 0 ? shadowParts.join(', ') : undefined;

  // Build border style
  let border = `1px solid ${borderColor}`;
  if (borderWidth === 'none') {
    border = 'none';
  } else if (borderWidth === 'thin') {
    border = `1px solid ${borderColor}`;
  } else if (borderWidth === 'medium') {
    border = `2px solid ${borderColor}`;
  } else if (borderWidth === 'bold') {
    border = `3px solid ${borderColor}`;
  }

  // Build background style
  let background: string = bgColor;
  if (toneStyle === 'gradient') {
    background = `linear-gradient(135deg, ${bgColor} 0%, ${gradientColor} 100%)`;
  } else if (toneStyle === 'glass') {
    background = bgColor;
  }

  // Inner icon / image filter
  let iconFilter: string | undefined;
  if (glowEffect === 'vibrant' || glowEffect === 'aura') {
    iconFilter = `drop-shadow(0 0 3px ${normalizedGlow.startsWith('#') ? `${normalizedGlow}90` : 'rgba(59, 130, 246, 0.6)'})`;
  } else if (shadowEffect === 'elevated') {
    iconFilter = 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35))';
  }

  // Dimensions based on size
  const sizeMap = {
    sm: { box: 'w-8 h-8', icon: 18 },
    md: { box: 'w-9 h-9', icon: 20 },
    lg: { box: 'w-11 h-11', icon: 25 },
    xl: { box: 'w-14 h-14', icon: 32 },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  const containerStyle: CSSProperties = {
    background,
    border,
    boxShadow,
    backdropFilter: toneStyle === 'glass' ? 'blur(8px)' : undefined,
    WebkitBackdropFilter: toneStyle === 'glass' ? 'blur(8px)' : undefined,
  };

  if (effectiveType === 'image' && effectiveImageUrl && !imgError) {
    return (
      <div
        className={`${currentSize.box} ${shape} flex items-center justify-center flex-shrink-0 overflow-hidden transition-all duration-300 ${className}`}
        style={containerStyle}
      >
        <img
          src={effectiveImageUrl}
          alt="Store Logo"
          onError={() => setImgError(true)}
          className="w-full h-full object-contain p-0.5"
          style={{ filter: iconFilter }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${currentSize.box} ${shape} flex items-center justify-center flex-shrink-0 transition-all duration-300 ${className}`}
      style={containerStyle}
    >
      <IconComponent
        size={currentSize.icon}
        style={{
          color: iconColor,
          filter: iconFilter,
        }}
      />
    </div>
  );
}
