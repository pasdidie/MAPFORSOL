import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../db/pool';
import { broadcastPixel } from '../services/websocket';

const router = Router();
const CANVAS_SIZE = 2048;
const CHUNK_SIZE = 256;
const COOLDOWN_SECONDS = 60;

router.get('/config', (req: Request, res: Response) => {
  const launchTimestamp = new Date(process.env.LAUNCH_TIMESTAMP || '2025-01-08T00:00:00+01:00').getTime();
  const freePhaseEnd = launchTimestamp + 7 * 24 * 60 * 60 * 1000;
  
  res.json({
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE, chunkSize: CHUNK_SIZE },
    launchTimestamp,
    freePhaseEnd,
    serverTime: Date.now(),
    cooldownSeconds: COOLDOWN_SECONDS,
  });
});

router.get('/chunk/:x/:y', async (req: Request, res: Response) => {
  try {
    const x = parseInt(req.params.x);
    const y = parseInt(req.params.y);
    const maxChunk = CANVAS_SIZE / CHUNK_SIZE - 1;
    
    if (isNaN(x) || isNaN(y) || x < 0 || y < 0 || x > maxChunk || y > maxChunk) {
      return res.status(400).json({ error: 'Invalid chunk coordinates' });
    }
    
    const result = await queryOne<{ data: Buffer }>('SELECT data FROM chunks WHERE x = $1 AND y = $2', [x, y]);
    
    if (!result) {
      return res.send(Buffer.alloc(CHUNK_SIZE * CHUNK_SIZE, 0));
    }
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(result.data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get chunk' });
  }
});

router.post('/pixel', async (req: Request, res: Response) => {
  try {
    const { wallet, x, y, color } = req.body;
    
    if (!wallet || typeof x !== 'number' || typeof y !== 'number' || typeof color !== 'number') {
      return res.status(400).json({ error: 'Invalid pixel data' });
    }
    
    if (x < 0 || x >= CANVAS_SIZE || y < 0 || y >= CANVAS_SIZE || color < 0 || color > 31) {
      return res.status(400).json({ error: 'Invalid coordinates or color' });
    }
    
    const user = await queryOne<{ last_pixel_at: Date }>('SELECT last_pixel_at FROM users WHERE wallet = $1', [wallet]);
    
    if (user?.last_pixel_at) {
      const cooldownEnd = user.last_pixel_at.getTime() + COOLDOWN_SECONDS * 1000;
      if (Date.now() < cooldownEnd) {
        return res.status(429).json({
          error: 'Cooldown active',
          cooldownRemaining: Math.ceil((cooldownEnd - Date.now()) / 1000),
          nextPixelAt: cooldownEnd,
        });
      }
    }
    
    // Check shield
    const shield = await queryOne(
      `SELECT owner FROM shields WHERE expires_at > NOW() AND owner != $1 AND $2 >= x0 AND $2 < x0 + size AND $3 >= y0 AND $3 < y0 + size`,
      [wallet, x, y]
    );
    
    if (shield) {
      return res.status(403).json({ error: 'This area is protected by a shield' });
    }
    
    // Place pixel
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkY = Math.floor(y / CHUNK_SIZE);
    const pixelIndex = (y % CHUNK_SIZE) * CHUNK_SIZE + (x % CHUNK_SIZE);
    
    await execute(
      'UPDATE chunks SET data = set_byte(data, $1, $2), updated_at = NOW() WHERE x = $3 AND y = $4',
      [pixelIndex, color, chunkX, chunkY]
    );
    
    await execute('INSERT INTO placements (wallet, x, y, color) VALUES ($1, $2, $3, $4)', [wallet, x, y, color]);
    
    await execute(
      'INSERT INTO users (wallet, last_pixel_at) VALUES ($1, NOW()) ON CONFLICT (wallet) DO UPDATE SET last_pixel_at = NOW()',
      [wallet]
    );
    
    const pixel = { x, y, color, wallet, timestamp: Date.now() };
    broadcastPixel(pixel);
    
    res.json({ success: true, pixel, nextPixelAt: Date.now() + COOLDOWN_SECONDS * 1000 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/cooldown/:wallet', async (req: Request, res: Response) => {
  try {
    const user = await queryOne<{ last_pixel_at: Date }>('SELECT last_pixel_at FROM users WHERE wallet = $1', [req.params.wallet]);
    const now = Date.now();
    let nextPixelAt = now;
    
    if (user?.last_pixel_at) {
      nextPixelAt = Math.max(now, user.last_pixel_at.getTime() + COOLDOWN_SECONDS * 1000);
    }
    
    res.json({ nextPixelAt, cooldownRemaining: Math.max(0, Math.ceil((nextPixelAt - now) / 1000)) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get cooldown' });
  }
});

export default router;
