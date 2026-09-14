import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeViewProps {
  value: string;
  format?: 'CODE128' | 'EAN13' | 'UPC' | 'EAN8' | 'CODE39';
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
  className?: string;
}

export default function BarcodeView({
  value,
  format = 'CODE128',
  width = 1.5,
  height = 36,
  displayValue = true,
  fontSize = 11,
  margin = 2,
  className = '',
}: BarcodeViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, String(value), {
        format,
        width,
        height,
        displayValue,
        fontSize,
        margin,
        textMargin: 2,
        lineColor: '#000000',
        background: '#ffffff',
      });
    } catch {
      // Fallback to CODE128 if format checksum fails (e.g. invalid EAN13)
      try {
        JsBarcode(svgRef.current, String(value), {
          format: 'CODE128',
          width,
          height,
          displayValue,
          fontSize,
          margin,
          textMargin: 2,
          lineColor: '#000000',
          background: '#ffffff',
        });
      } catch (e) {
        console.error('Barcode render error:', e);
      }
    }
  }, [value, format, width, height, displayValue, fontSize, margin]);

  if (!value) return null;

  return <svg ref={svgRef} className={`inline-block max-w-full ${className}`} />;
}
