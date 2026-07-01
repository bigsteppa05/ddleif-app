// Web-only event share helpers. Builds a branded event card (SVG -> PNG via an
// offscreen canvas) and shares it through the browser's native share sheet
// (navigator.share with files) — the Luma/Spotify "post to story" flow — with a
// download fallback. Also a plain link/text share. No native modules required,
// so nothing here needs a native rebuild. All functions no-op off web.
import { Platform } from 'react-native';

export type EventCardData = {
  title: string;
  sport: string;
  dateTime: string;
  location: string;
  url: string;
};

const W = 1080;
const H = 1350;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Greedy word-wrap into at most `maxLines`, ellipsising the final line if needed.
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  const last = lines[maxLines - 1];
  if (last && last.length > maxChars) lines[maxLines - 1] = `${last.slice(0, maxChars - 1)}…`;
  return lines;
}

export function buildEventCardSvg(d: EventCardData): string {
  const titleLines = wrap(d.title, 15, 3);
  const titleStartY = 620 - (titleLines.length - 1) * 52;
  const titleTspans = titleLines
    .map((ln, i) => `<tspan x="80" y="${titleStartY + i * 104}">${esc(ln)}</tspan>`)
    .join('');
  const host = d.url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#0E1512"/>
      <stop offset="1" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="80" y="120" width="132" height="12" rx="6" fill="#C8FF00"/>
  <text x="80" y="184" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="800" fill="#C8FF00">fitXball</text>
  <text x="${W - 80}" y="180" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#FFFFFF" opacity="0.85">${esc(d.sport.toUpperCase())}</text>

  <text font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="800" fill="#FFFFFF" letter-spacing="-2">${titleTspans}</text>

  <text x="80" y="810" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="700" fill="#C8FF00">${esc(d.dateTime)}</text>
  <text x="80" y="874" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="500" fill="#FFFFFF" opacity="0.75">${esc(d.location)}</text>

  <line x1="80" y1="1120" x2="${W - 80}" y2="1120" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="2"/>
  <text x="80" y="1200" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="600" fill="#FFFFFF" opacity="0.6">Book your spot</text>
  <text x="80" y="1250" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#C8FF00">${esc(host)}</text>
</svg>`;
}

function svgToPng(svg: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, W, H);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => resolve(b), 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

// Returns how it was handled so the caller can give the right feedback.
export async function shareEventCard(d: EventCardData): Promise<'shared' | 'downloaded' | 'unsupported'> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return 'unsupported';
  const png = await svgToPng(buildEventCardSvg(d));
  if (!png) return 'unsupported';
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  const file = typeof File !== 'undefined' ? new File([png], 'fitxball-event.png', { type: 'image/png' }) : null;
  if (nav?.canShare && file && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: d.title, text: `${d.title} — ${d.dateTime}`, url: d.url });
    } catch {
      /* user dismissed the share sheet — treat as handled */
    }
    return 'shared';
  }
  // Fallback: download the PNG so the user can post it manually.
  const a = document.createElement('a');
  a.href = URL.createObjectURL(png);
  a.download = 'fitxball-event.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}

export async function shareEventLink(d: EventCardData): Promise<'shared' | 'copied' | 'unsupported'> {
  if (Platform.OS !== 'web') return 'unsupported';
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  const text = `Join ${d.title} on ${d.dateTime} at ${d.location}`;
  if (nav?.share) {
    try {
      await nav.share({ title: d.title, text, url: d.url });
    } catch {
      /* dismissed */
    }
    return 'shared';
  }
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(`${text} — ${d.url}`);
    return 'copied';
  }
  return 'unsupported';
}
