import sharp from 'sharp';

const NEON_PALETTE = [
  '#000000', '#FFFFFF', '#FF0040', '#FF0080', '#FF00FF', '#C000FF', '#8000FF', '#4000FF',
  '#0040FF', '#0080FF', '#00BFFF', '#00FFFF', '#00FFBF', '#00FF80', '#00FF40', '#00FF00',
  '#40FF00', '#80FF00', '#BFFF00', '#FFFF00', '#FFBF00', '#FF8000', '#FF4000', '#FF6060',
  '#FF80C0', '#C080FF', '#80C0FF', '#80FFC0', '#FFFFA0', '#404040', '#808080', '#C0C0C0',
];

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 0, b: 0 };
}

function findNearestColor(r: number, g: number, b: number): number {
  let minDistance = Infinity;
  let nearestIndex = 0;
  
  for (let i = 0; i < NEON_PALETTE.length; i++) {
    const c = hexToRgb(NEON_PALETTE[i]);
    const distance = Math.sqrt(Math.pow(r - c.r, 2) + Math.pow(g - c.g, 2) + Math.pow(b - c.b, 2));
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
    }
  }
  
  return nearestIndex;
}

export async function processStampImage(imageBuffer: Buffer, targetSize: number) {
  const resized = await sharp(imageBuffer)
    .resize(targetSize, targetSize, { fit: 'cover', position: 'center' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { data, info } = resized;
  const pixels: Array<{ localX: number; localY: number; color: number }> = [];
  
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const colorIndex = findNearestColor(data[idx], data[idx + 1], data[idx + 2]);
      pixels.push({ localX: x, localY: y, color: colorIndex });
    }
  }
  
  return { width: targetSize, height: targetSize, pixels };
}

export async function generateStampPreview(stamp: { width: number; height: number; pixels: Array<{ localX: number; localY: number; color: number }> }): Promise<Buffer> {
  const buffer = Buffer.alloc(stamp.width * stamp.height * 3);
  
  for (const pixel of stamp.pixels) {
    const rgb = hexToRgb(NEON_PALETTE[pixel.color]);
    const idx = (pixel.localY * stamp.width + pixel.localX) * 3;
    buffer[idx] = rgb.r;
    buffer[idx + 1] = rgb.g;
    buffer[idx + 2] = rgb.b;
  }
  
  return sharp(buffer, { raw: { width: stamp.width, height: stamp.height, channels: 3 } }).png().toBuffer();
}
