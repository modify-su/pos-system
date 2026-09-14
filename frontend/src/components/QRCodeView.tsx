import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeViewProps {
  value: string;
  size?: number;
  margin?: number;
  className?: string;
  darkColor?: string;
  lightColor?: string;
}

export default function QRCodeView({
  value,
  size = 96,
  margin = 1,
  className = '',
  darkColor = '#000000',
  lightColor = '#ffffff',
}: QRCodeViewProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    if (!value) {
      setDataUrl('');
      return;
    }
    QRCode.toDataURL(String(value), {
      width: size,
      margin,
      color: {
        dark: darkColor,
        light: lightColor,
      },
    })
      .then((url) => setDataUrl(url))
      .catch((err) => {
        console.error('QR code generation error:', err);
      });
  }, [value, size, margin, darkColor, lightColor]);

  if (!value || !dataUrl) return null;

  return (
    <img
      src={dataUrl}
      alt={`QR: ${value}`}
      width={size}
      height={size}
      className={`inline-block ${className}`}
    />
  );
}
