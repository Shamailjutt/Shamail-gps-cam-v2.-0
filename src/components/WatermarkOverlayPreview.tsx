import { useEffect, useRef, useState } from 'react';
import { GpsData, WatermarkSettings } from '../types';
import { loadImageElement, measureAndDrawWatermarkCard } from '../utils/watermarkCanvas';

interface WatermarkOverlayPreviewProps {
  settings: WatermarkSettings;
  gps: GpsData;
  defaultLogoUrl: string;
  nowMillis: number;
  onClick?: () => void;
}

export function WatermarkOverlayPreview({
  settings,
  gps,
  defaultLogoUrl,
  nowMillis,
  onClick,
}: WatermarkOverlayPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;
    if (!settings.showLogo || settings.showWatermark === false) {
      setLogoImg(null);
      return;
    }
    const src = settings.customLogoDataUrl || defaultLogoUrl;
    loadImageElement(src).then((loaded) => {
      if (active) setLogoImg(loaded);
    });
    return () => {
      active = false;
    };
  }, [settings.showLogo, settings.showWatermark, settings.customLogoDataUrl, defaultLogoUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (settings.showWatermark === false) {
      canvas.width = 920;
      canvas.height = 1;
      ctx.clearRect(0, 0, 920, 1);
      return;
    }

    const logicalW = 920;
    const { cardHeight } = measureAndDrawWatermarkCard({
      ctx,
      containerW: logicalW,
      containerH: null,
      settings,
      gps,
      logoImg,
      nowMillis,
    });

    const logicalH = Math.max(48, Math.ceil(cardHeight + 12));
    if (canvas.width !== logicalW || canvas.height !== logicalH) {
      canvas.width = logicalW;
      canvas.height = logicalH;
    } else {
      ctx.clearRect(0, 0, logicalW, logicalH);
    }

    measureAndDrawWatermarkCard({
      ctx,
      containerW: logicalW,
      containerH: logicalH,
      settings,
      gps,
      logoImg,
      nowMillis,
    });
  }, [settings, gps, logoImg, nowMillis]);

  if (settings.showWatermark === false) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="Tap to customize Date & Time or SHAMAIL PERA watermark"
      className="w-full block text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-xl cursor-pointer"
    >
      <canvas ref={canvasRef} className="w-full h-auto block" />
    </button>
  );
}
