import {
  CoordFormat,
  GpsData,
  ResolutionPreset,
  TimestampMode,
  WatermarkPosition,
  WatermarkSettings,
  WatermarkSize,
  WatermarkStyle,
  WatermarkTextColor,
} from '../types';

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function buildLocationHeadline(gps: GpsData): string {
  if (!gps.hasFix) return 'Waiting for GPS Satellite Fix...';
  const parts: string[] = [];
  const pushUnique = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !parts.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      parts.push(trimmed);
    }
  };
  pushUnique(gps.city);
  pushUnique(gps.district);
  pushUnique(gps.province);
  pushUnique(gps.country);
  if (parts.length > 0) return parts.join(', ');
  return `GPS ${gps.latitude.toFixed(5)}°, ${gps.longitude.toFixed(5)}°`;
}

export function buildFullAddressLine(gps: GpsData): string {
  if (!gps.hasFix) return 'Grant Location permission or select a location on Map';
  if (gps.streetAddress.trim()) return gps.streetAddress.trim();
  if (gps.isOfflineAddress) {
    return `${gps.latitude.toFixed(6)}°, ${gps.longitude.toFixed(6)}°`;
  }
  return `${gps.latitude.toFixed(6)}°, ${gps.longitude.toFixed(6)}°`;
}

export function resolveTimestampMillis(
  settings: WatermarkSettings,
  gps: GpsData,
  nowMillis: number = Date.now()
): number {
  if (settings.timestampMode === TimestampMode.Manual) {
    return settings.manualTimestampMillis;
  }
  if (settings.timestampMode === TimestampMode.GpsFix) {
    return gps.hasFix && gps.gpsTimestampMillis > 0 ? gps.gpsTimestampMillis : nowMillis;
  }
  return nowMillis;
}

/**
 * Formats watermark timestamp cleanly with ZERO "Edited", "[Edited]", "Modified", or "(GPS)" suffixes.
 */
export function formatWatermarkTimestamp(
  settings: WatermarkSettings,
  gps: GpsData,
  nowMillis: number = Date.now()
): string {
  const targetMs = resolveTimestampMillis(settings, gps, nowMillis);
  return formatTimestampMillisClean(targetMs, settings.dateFormatPattern, settings.is24HourFormat);
}

export function formatTimestampMillisClean(
  targetMs: number,
  dateFormatPattern: WatermarkSettings['dateFormatPattern'],
  is24HourFormat: boolean
): string {
  const d = new Date(targetMs);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const mmm = MONTHS_SHORT[d.getMonth()];
  const eee = DAYS_SHORT[d.getDay()];

  let datePart = `${dd} ${mmm} ${yyyy}`;
  if (dateFormatPattern === 'yyyy-MM-dd') {
    datePart = `${yyyy}-${mm}-${dd}`;
  } else if (dateFormatPattern === 'dd/MM/yyyy') {
    datePart = `${dd}/${mm}/${yyyy}`;
  } else if (dateFormatPattern === 'EEE, dd MMM yyyy') {
    datePart = `${eee}, ${dd} ${mmm} ${yyyy}`;
  }

  let timePart = '';
  if (is24HourFormat) {
    timePart = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  } else {
    const rawHours = d.getHours();
    const ampm = rawHours >= 12 ? 'PM' : 'AM';
    const h12 = rawHours % 12 || 12;
    timePart = `${pad2(h12)}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${ampm}`;
  }

  return `${datePart}, ${timePart}`;
}

function toDms(coord: number, isLat: boolean): string {
  const hemi = isLat ? (coord >= 0 ? 'N' : 'S') : coord >= 0 ? 'E' : 'W';
  const absVal = Math.abs(coord);
  const deg = Math.floor(absVal);
  const minFull = (absVal - deg) * 60;
  const min = Math.floor(minFull);
  const sec = (minFull - min) * 60;
  return `${deg}°${pad2(min)}'${sec.toFixed(1).padStart(4, '0')}"${hemi}`;
}

export function formatWatermarkCoordinates(settings: WatermarkSettings, gps: GpsData): string {
  if (!gps.hasFix) return 'Lat: --.------°   Lon: --.------°';
  if (settings.coordFormat === CoordFormat.Dms) {
    return `Lat ${toDms(gps.latitude, true)}, Lon ${toDms(gps.longitude, false)}`;
  }
  const latH = gps.latitude >= 0 ? 'N' : 'S';
  const lonH = gps.longitude >= 0 ? 'E' : 'W';
  return `Lat ${Math.abs(gps.latitude).toFixed(6)}° ${latH}, Lon ${Math.abs(gps.longitude).toFixed(6)}° ${lonH}`;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines - 1) {
        const rest = [current, ...words.slice(i + 1)].join(' ');
        let clipped = rest;
        while (clipped.length > 3 && ctx.measureText(`${clipped}…`).width > maxWidth) {
          clipped = clipped.slice(0, -1);
        }
        current = clipped === rest ? rest : `${clipped}…`;
        break;
      }
    }
  }
  lines.push(current);
  return lines.slice(0, maxLines);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawTacticalMapThumbnail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  unit: number
) {
  const r = Math.max(8, 10 * unit);
  ctx.save();
  drawRoundedRect(ctx, x, y, size, size, r);
  ctx.fillStyle = '#0F1520';
  ctx.fill();
  ctx.clip();

  // Subtle tactical coordinate grid
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
  ctx.lineWidth = Math.max(1, 0.9 * unit);
  const step = size / 4;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + step * i, y);
    ctx.lineTo(x + step * i, y + size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y + step * i);
    ctx.lineTo(x + size, y + step * i);
    ctx.stroke();
  }

  // Stylized arterial avenues
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = Math.max(1.5, 2.2 * unit);
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.68);
  ctx.lineTo(x + size, y + size * 0.34);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + size * 0.28, y);
  ctx.lineTo(x + size * 0.66, y + size);
  ctx.stroke();

  // Radar lock pulse rings + center pin
  const cx = x + size * 0.5;
  const cy = y + size * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(3.5, 5.2 * unit), 0, Math.PI * 2);
  ctx.fillStyle = '#EA580C';
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, 1.5 * unit);
  ctx.strokeStyle = '#FEF3C7';
  ctx.stroke();

  ctx.restore();

  drawRoundedRect(ctx, x, y, size, size, r);
  ctx.lineWidth = Math.max(1, 1.1 * unit);
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
  ctx.stroke();
}

export function measureAndDrawWatermarkCard(params: {
  ctx: CanvasRenderingContext2D;
  containerW: number;
  containerH: number | null;
  settings: WatermarkSettings;
  gps: GpsData;
  logoImg: HTMLImageElement | null;
  nowMillis: number;
}): { cardHeight: number; timestampText: string } {
  const { ctx, containerW, containerH, settings, gps, logoImg, nowMillis } = params;
  const timestampText = formatWatermarkTimestamp(settings, gps, nowMillis);

  if (settings.showWatermark === false) {
    return { cardHeight: 0, timestampText };
  }

  const style = settings.watermarkStyle || WatermarkStyle.ClassicCard;
  const isCompact = style === WatermarkStyle.CompactStrip;
  const isBanner = style === WatermarkStyle.ModernBanner;

  const outerMargin = Math.max(12, containerW * 0.025);
  const availW = Math.max(160, containerW - outerMargin * 2);
  const baseFraction =
    settings.watermarkSize === WatermarkSize.Small
      ? 0.7
      : settings.watermarkSize === WatermarkSize.Large
        ? 0.96
        : 0.88;
  const widthFraction = isBanner ? Math.max(baseFraction, 0.95) : baseFraction;
  const cardWidth = availW * widthFraction;

  const unit = (cardWidth / 460) * settings.fontScale * (isCompact ? 0.92 : 1.0);
  const pad = Math.max(9, (isCompact ? 11 : 14) * unit);
  const cornerRadius = Math.max(8, (isBanner ? 10 : 14) * unit);
  const lineGap = (isCompact ? 3.8 : 5) * unit;

  const hasLogo = settings.showLogo;
  const logoSize = hasLogo ? Math.max(38, (isCompact ? 54 : 66) * unit) : 0;
  const logoGap = hasLogo ? 13 * unit : 0;

  const hasMapThumb = Boolean(settings.showMapThumbnail && gps.hasFix);
  const mapThumbSize = hasMapThumb ? Math.max(46, (isCompact ? 58 : 72) * unit) : 0;
  const mapThumbGap = hasMapThumb ? 12 * unit : 0;

  const textColWidth = Math.max(
    90,
    cardWidth - pad * 2 - logoSize - logoGap - mapThumbSize - mapThumbGap
  );

  const orgFont = `700 ${Math.round(12.8 * unit)}px "Plus Jakarta Sans", sans-serif`;
  const locFont = `700 ${Math.round(19 * unit)}px "Plus Jakarta Sans", sans-serif`;
  const addrFont = `400 ${Math.round(12.8 * unit)}px "Plus Jakarta Sans", sans-serif`;
  const metaFont = `500 ${Math.round(12 * unit)}px "JetBrains Mono", monospace`;

  const orgText = (settings.organizationName.trim() || 'SHAMAIL PERA').toUpperCase();
  ctx.font = orgFont;
  const orgLines = settings.showOrgHeading ? wrapCanvasText(ctx, orgText, textColWidth, 1) : [];

  ctx.font = locFont;
  const locLines = settings.showLocationTitle
    ? wrapCanvasText(ctx, buildLocationHeadline(gps), textColWidth, isCompact ? 1 : 2)
    : [];

  ctx.font = addrFont;
  const addrLines = settings.showFullAddress
    ? wrapCanvasText(ctx, buildFullAddressLine(gps), textColWidth, isCompact ? 1 : 2)
    : [];

  ctx.font = metaFont;
  const coordLines = settings.showCoordinates
    ? wrapCanvasText(ctx, formatWatermarkCoordinates(settings, gps), textColWidth, 1)
    : [];

  const bottomParts: string[] = [];
  if (settings.showDateTime) {
    bottomParts.push(timestampText);
  }
  if (settings.showAccuracy && gps.hasFix && gps.accuracyMeters > 0) {
    bottomParts.push(`Acc: ±${gps.accuracyMeters.toFixed(1)} m`);
  }
  const bottomLines =
    bottomParts.length > 0 ? wrapCanvasText(ctx, bottomParts.join('  |  '), textColWidth, 2) : [];

  const orgLineH = 15.5 * unit;
  const locLineH = 22.5 * unit;
  const addrLineH = 16.5 * unit;
  const metaLineH = 15.5 * unit;

  let textHeight = 0;
  if (orgLines.length) textHeight += orgLines.length * orgLineH + lineGap;
  if (locLines.length) textHeight += locLines.length * locLineH + lineGap;
  if (addrLines.length) textHeight += addrLines.length * addrLineH + lineGap * 1.1;
  if (coordLines.length) textHeight += coordLines.length * metaLineH + lineGap * 0.65;
  if (bottomLines.length) textHeight += bottomLines.length * metaLineH;

  const innerHeight = Math.max(textHeight, logoSize, mapThumbSize, 36);
  const bannerHeaderRibbon = isBanner ? 4 * unit : 0;
  const cardHeight = innerHeight + pad * 2 + bannerHeaderRibbon;

  if (containerH === null) {
    return { cardHeight, timestampText };
  }

  const cardLeft =
    settings.watermarkPosition === WatermarkPosition.BottomLeft
      ? outerMargin
      : settings.watermarkPosition === WatermarkPosition.BottomRight
        ? containerW - outerMargin - cardWidth
        : (containerW - cardWidth) / 2;
  const cardTop =
    containerH > cardHeight + outerMargin * 2
      ? Math.max(outerMargin, containerH - outerMargin - cardHeight)
      : Math.max(4, (containerH - cardHeight) / 2);

  // Deep charcoal/obsidian translucent card backdrop
  const alpha = Math.min(0.95, Math.max(0.3, settings.watermarkOpacity / 100));
  drawRoundedRect(ctx, cardLeft, cardTop, cardWidth, cardHeight, cornerRadius);
  ctx.fillStyle = `rgba(10, 12, 17, ${alpha})`;
  ctx.fill();

  ctx.lineWidth = Math.max(1, 1.2 * unit);
  ctx.strokeStyle = isBanner ? 'rgba(234, 88, 12, 0.45)' : 'rgba(245, 158, 11, 0.36)';
  ctx.stroke();

  if (isBanner) {
    // Full-width top gold-orange accent bar on Modern Banner
    ctx.save();
    drawRoundedRect(ctx, cardLeft, cardTop, cardWidth, cardHeight, cornerRadius);
    ctx.clip();
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(cardLeft, cardTop, cardWidth * 0.72, Math.max(3, 3.5 * unit));
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(cardLeft + cardWidth * 0.72, cardTop, cardWidth * 0.28, Math.max(3, 3.5 * unit));
    ctx.restore();
  } else if (isCompact) {
    // Left vertical gold accent bar on Compact Strip
    drawRoundedRect(
      ctx,
      cardLeft + Math.max(3, 4 * unit),
      cardTop + pad * 0.75,
      Math.max(3, 3.5 * unit),
      cardHeight - pad * 1.5,
      2
    );
    ctx.fillStyle = '#F59E0B';
    ctx.fill();
  } else {
    // Classic Card top gold accent rule
    drawRoundedRect(ctx, cardLeft + pad, cardTop, 58 * unit, Math.max(2.5, 3 * unit), 2);
    ctx.fillStyle = '#F59E0B';
    ctx.fill();
  }

  let textStartX = cardLeft + pad + (isCompact ? 4 * unit : 0);
  if (hasLogo) {
    const logoY = cardTop + bannerHeaderRibbon + (cardHeight - bannerHeaderRibbon - logoSize) / 2;
    const cx = textStartX + logoSize / 2;
    const cy = logoY + logoSize / 2;
    const rad = logoSize / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#050608';
    ctx.fill();
    ctx.clip();
    if (logoImg) {
      ctx.drawImage(logoImg, textStartX, logoY, logoSize, logoSize);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.closePath();
    ctx.lineWidth = Math.max(1.2, 1.4 * unit);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
    ctx.stroke();

    textStartX += logoSize + logoGap;
  }

  if (hasMapThumb) {
    const thumbX = cardLeft + cardWidth - pad - mapThumbSize;
    const thumbY =
      cardTop + bannerHeaderRibbon + (cardHeight - bannerHeaderRibbon - mapThumbSize) / 2;
    drawTacticalMapThumbnail(ctx, thumbX, thumbY, mapThumbSize, unit);
  }

  const primaryTextHex =
    settings.textColor === WatermarkTextColor.Gold
      ? '#FDE68A'
      : settings.textColor === WatermarkTextColor.Ivory
        ? '#FEF3C7'
        : '#FFFFFF';

  const secondaryTextHex =
    settings.textColor === WatermarkTextColor.Gold
      ? '#FCD34D'
      : settings.textColor === WatermarkTextColor.Ivory
        ? '#FDE68A'
        : '#E2E8F0';

  let cursorY = cardTop + pad + bannerHeaderRibbon;
  ctx.textBaseline = 'top';

  if (orgLines.length) {
    ctx.font = orgFont;
    ctx.fillStyle = '#FBBF24';
    orgLines.forEach((line) => {
      ctx.fillText(line, textStartX, cursorY);
      cursorY += orgLineH;
    });
    cursorY += lineGap;
  }

  if (locLines.length) {
    ctx.font = locFont;
    ctx.fillStyle = primaryTextHex;
    locLines.forEach((line) => {
      ctx.fillText(line, textStartX, cursorY);
      cursorY += locLineH;
    });
    cursorY += lineGap;
  }

  if (addrLines.length) {
    ctx.font = addrFont;
    ctx.fillStyle = secondaryTextHex;
    addrLines.forEach((line) => {
      ctx.fillText(line, textStartX, cursorY);
      cursorY += addrLineH;
    });
    cursorY += lineGap * 1.1;
  }

  if (coordLines.length) {
    ctx.font = metaFont;
    ctx.fillStyle = primaryTextHex;
    coordLines.forEach((line) => {
      ctx.fillText(line, textStartX, cursorY);
      cursorY += metaLineH;
    });
    cursorY += lineGap * 0.65;
  }

  if (bottomLines.length) {
    ctx.font = metaFont;
    ctx.fillStyle = secondaryTextHex;
    bottomLines.forEach((line) => {
      ctx.fillText(line, textStartX, cursorY);
      cursorY += metaLineH;
    });
  }

  return { cardHeight, timestampText };
}

export async function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function captureRawBasePhoto(params: {
  sourceElement: HTMLVideoElement | HTMLImageElement;
  isMirroredFrontCamera: boolean;
  resolutionPreset: ResolutionPreset;
  jpegQuality: number;
}): { rawBaseDataUrl: string; width: number; height: number } {
  const { sourceElement, isMirroredFrontCamera, resolutionPreset, jpegQuality } = params;

  const rawWidth =
    sourceElement instanceof HTMLVideoElement
      ? sourceElement.videoWidth || 1920
      : sourceElement.naturalWidth || 1920;
  const rawHeight =
    sourceElement instanceof HTMLVideoElement
      ? sourceElement.videoHeight || 1080
      : sourceElement.naturalHeight || 1080;

  let targetW = rawWidth;
  let targetH = rawHeight;
  const maxEdgeTarget =
    resolutionPreset === ResolutionPreset.Fhd
      ? 1920
      : resolutionPreset === ResolutionPreset.Hd
        ? 1280
        : 0;

  if (maxEdgeTarget > 0) {
    const longEdge = Math.max(rawWidth, rawHeight);
    if (longEdge > maxEdgeTarget) {
      const ratio = maxEdgeTarget / longEdge;
      targetW = Math.max(1, Math.round(rawWidth * ratio));
      targetH = Math.max(1, Math.round(rawHeight * ratio));
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  ctx.save();
  if (isMirroredFrontCamera) {
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(sourceElement, 0, 0, targetW, targetH);
  ctx.restore();

  const qualityDecimal = Math.min(1, Math.max(0.85, jpegQuality / 100));
  return {
    rawBaseDataUrl: canvas.toDataURL('image/jpeg', qualityDecimal),
    width: targetW,
    height: targetH,
  };
}

export async function composeWatermarkedPhoto(params: {
  sourceElement: HTMLVideoElement | HTMLImageElement;
  isMirroredFrontCamera: boolean;
  settings: WatermarkSettings;
  gps: GpsData;
  defaultLogoUrl: string;
  captureMillis: number;
}): Promise<{ dataUrl: string; width: number; height: number; timestampText: string }> {
  const { sourceElement, isMirroredFrontCamera, settings, gps, defaultLogoUrl, captureMillis } =
    params;

  const rawWidth =
    sourceElement instanceof HTMLVideoElement
      ? sourceElement.videoWidth || 1920
      : sourceElement.naturalWidth || 1920;
  const rawHeight =
    sourceElement instanceof HTMLVideoElement
      ? sourceElement.videoHeight || 1080
      : sourceElement.naturalHeight || 1080;

  let targetW = rawWidth;
  let targetH = rawHeight;
  const maxEdgeTarget =
    settings.resolutionPreset === ResolutionPreset.Fhd
      ? 1920
      : settings.resolutionPreset === ResolutionPreset.Hd
        ? 1280
        : 0;

  if (maxEdgeTarget > 0) {
    const longEdge = Math.max(rawWidth, rawHeight);
    if (longEdge > maxEdgeTarget) {
      const ratio = maxEdgeTarget / longEdge;
      targetW = Math.max(1, Math.round(rawWidth * ratio));
      targetH = Math.max(1, Math.round(rawHeight * ratio));
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  ctx.save();
  if (isMirroredFrontCamera) {
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(sourceElement, 0, 0, targetW, targetH);
  ctx.restore();

  let logoImg: HTMLImageElement | null = null;
  if (settings.showLogo && settings.showWatermark !== false) {
    const logoSrc = settings.customLogoDataUrl || defaultLogoUrl;
    logoImg = await loadImageElement(logoSrc);
  }

  const { timestampText } = measureAndDrawWatermarkCard({
    ctx,
    containerW: targetW,
    containerH: targetH,
    settings,
    gps,
    logoImg,
    nowMillis: captureMillis,
  });

  const qualityDecimal = Math.min(1, Math.max(0.7, settings.jpegQuality / 100));
  const dataUrl = canvas.toDataURL('image/jpeg', qualityDecimal);

  return {
    dataUrl,
    width: targetW,
    height: targetH,
    timestampText,
  };
}
