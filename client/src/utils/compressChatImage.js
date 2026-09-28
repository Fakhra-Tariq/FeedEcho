const TARGET_BYTES = 1024 * 1024;
const MAX_EDGE = 1600;

const readJpegOrientation = (buffer) => {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    if (marker === 0xffda) break;
    const size = view.getUint16(offset + 2);
    if (size < 2) break;
    if (marker === 0xffe1) {
      const start = offset + 4;
      if (
        view.getUint8(start) === 0x45 &&
        view.getUint8(start + 1) === 0x78 &&
        view.getUint8(start + 2) === 0x69 &&
        view.getUint8(start + 3) === 0x66
      ) {
        return readTiffOrientation(view, start + 6);
      }
    }
    offset += 2 + size;
  }
  return 1;
};

const readTiffOrientation = (view, tiffStart) => {
  if (tiffStart + 8 > view.byteLength) return 1;
  const byteOrder = view.getUint16(tiffStart);
  const little = byteOrder === 0x4949;
  const get16 = (relative) => view.getUint16(tiffStart + relative, little);
  const get32 = (relative) => view.getUint32(tiffStart + relative, little);
  if (get16(2) !== 42) return 1;
  let ifd = get32(4);
  if (tiffStart + ifd + 2 > view.byteLength) return 1;
  const count = get16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (tiffStart + entry + 12 > view.byteLength) break;
    if (get16(entry) === 0x0112) {
      const value = get16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
};

const loadImageElement = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });

const loadOrientedSource = async (file, orientation) => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, orientation: 1, close: () => bitmap.close?.() };
    } catch {
      // Older browsers ignore the option or lack createImageBitmap.
    }
  }
  const img = await loadImageElement(file);
  return { source: img, orientation, close: () => {} };
};

const drawOriented = (source, orientation) => {
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  const swapped = orientation >= 5 && orientation <= 8;
  const canvas = document.createElement('canvas');
  canvas.width = swapped ? height : width;
  canvas.height = swapped ? width : height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image.');
  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, height, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, height, width);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, width);
      break;
    default:
      break;
  }
  ctx.drawImage(source, 0, 0);
  return canvas;
};

const scaleCanvas = (source, edge) => {
  const longest = Math.max(source.width, source.height);
  if (longest <= edge) return source;
  const ratio = edge / longest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * ratio));
  canvas.height = Math.max(1, Math.round(source.height * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const canvasToJpeg = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not read that image.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });

const fileFromBlob = (blob, originalName) => {
  const base = String(originalName || 'photo').replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
};

export async function prepareChatImage(file) {
  const name = file?.name || 'photo.jpg';
  const type = String(file?.type || '').toLowerCase();
  const isGif = type === 'image/gif' || /\.gif$/i.test(name);
  if (isGif || !file) return file;

  const isJpeg = type === 'image/jpeg' || type === 'image/jpg' || /\.jpe?g$/i.test(name);
  let orientation = 1;
  if (isJpeg) {
    const buffer = await file.arrayBuffer();
    orientation = readJpegOrientation(buffer);
  }

  if (file.size <= TARGET_BYTES && orientation === 1) return file;

  const loaded = await loadOrientedSource(file, orientation);
  try {
    const oriented = drawOriented(loaded.source, loaded.orientation);
    let canvas = scaleCanvas(oriented, MAX_EDGE);
    let quality = 0.8;
    let blob = await canvasToJpeg(canvas, quality);
    while (blob.size > TARGET_BYTES && quality > 0.45) {
      quality = Math.round((quality - 0.1) * 10) / 10;
      blob = await canvasToJpeg(canvas, quality);
    }
    while (blob.size > TARGET_BYTES && Math.max(canvas.width, canvas.height) > 640) {
      canvas = scaleCanvas(canvas, Math.round(Math.max(canvas.width, canvas.height) * 0.85));
      quality = 0.7;
      blob = await canvasToJpeg(canvas, quality);
    }
    return fileFromBlob(blob, name);
  } finally {
    loaded.close();
  }
}

export { readJpegOrientation };
