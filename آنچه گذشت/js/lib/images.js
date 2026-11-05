/**
 * Client-side image pipeline.
 * Every photograph is normalised to a maximum edge of 720px (never upscaled),
 * re-encoded as WebP (JPEG fallback) and stripped of EXIF metadata — including
 * GPS coordinates, which most phones embed by default.
 */
import { CONFIG } from '../config.js';

const SUPPORTED = /^image\/(jpeg|jpg|png|webp|avif|gif|bmp|heic|heif)$/i;

export function validateImage(file) {
  if (!file) return 'فایلی انتخاب نشد';
  if (!file.type || !SUPPORTED.test(file.type)) {
    return `${file.name || 'این فایل'} تصویر پشتیبانی‌شده‌ای نیست (JPG، PNG، WebP، AVIF یا GIF).`;
  }
  if (file.size > 25 * 1024 * 1024) return `${file.name} is larger than 25 MB.`;
  return null;
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall through */ }
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('این تصویر خوانده نشد.')); };
    img.src = url;
  });
}

function drawToBlob(source, width, height, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#0c0b0a';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob && blob.type === 'image/webp') { resolve({ blob, ext: 'webp' }); return; }
      canvas.toBlob((jpg) => resolve({ blob: jpg, ext: 'jpg' }),
        'image/jpeg', Math.min(0.92, quality + 0.04));
    }, 'image/webp', quality);
  });
}

/**
 * @returns {Promise<{file:File, blob:Blob, width:number, height:number, ext:string,
 *   originalWidth:number, originalHeight:number, originalSize:number, resized:boolean}>}
 */
export async function processImage(file, { max = CONFIG.image.maxEdge, quality = CONFIG.image.quality } = {}) {
  const err = validateImage(file);
  if (err) throw new Error(err);

  const bitmap = await decode(file);
  const ow = bitmap.width || bitmap.naturalWidth;
  const oh = bitmap.height || bitmap.naturalHeight;
  if (!ow || !oh) throw new Error('ابعاد این تصویر خوانا نیست.');

  const scale = Math.min(1, max / Math.max(ow, oh));
  const width = Math.max(1, Math.round(ow * scale));
  const height = Math.max(1, Math.round(oh * scale));

  const { blob, ext } = await drawToBlob(bitmap, width, height, quality);
  if (bitmap.close) bitmap.close();
  if (!blob) throw new Error('این تصویر پردازش نشد.');

  const base = (file.name || 'photo').replace(/\.[^.]+$/, '').slice(0, 48) || 'photo';
  const outFile = new File([blob], `${base}.${ext}`, { type: blob.type });

  return {
    file: outFile,
    blob,
    width,
    height,
    ext,
    originalWidth: ow,
    originalHeight: oh,
    originalSize: file.size,
    resized: scale < 1,
  };
}

/** Square crop helper used for profile portraits. */
export async function processAvatar(file, size = 512) {
  const bitmap = await decode(file);
  const ow = bitmap.width || bitmap.naturalWidth;
  const oh = bitmap.height || bitmap.naturalHeight;
  const side = Math.min(ow, oh);
  const sx = (ow - side) / 2;
  const sy = (oh - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(size, side);
  canvas.height = canvas.width;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.88));
  return { blob, ext: 'webp', width: canvas.width, height: canvas.height };
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('فایل خوانده نشد'));
    r.readAsDataURL(blob);
  });
}

export function dataURLToBlob(dataUrl) {
  const [meta, b64] = String(dataUrl).split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text, filename, type = 'text/plain') {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

/** Read a dropped file list, keeping only images. */
export function imagesFromDataTransfer(dt) {
  const files = Array.from(dt?.files || []);
  if (files.length) return files.filter((f) => f.type.startsWith('image/'));
  return Array.from(dt?.items || [])
    .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter(Boolean);
}

export async function copyImageToClipboard(blob) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch { return false; }
}
