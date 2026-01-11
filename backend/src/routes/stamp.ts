import { Router, Request, Response } from 'express';
import multer from 'multer';
import { processStampImage, generateStampPreview } from '../services/image';
import { query, execute, queryOne } from '../db/pool';
import { verifyPaymentReal, recordPayment } from '../services/payment';
import { broadcastStamp } from '../services/websocket';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const STAMP_PRICES: Record<number, number> = {
  32: parseInt(process.env.STAMP_PRICE_32 || '100'),
  64: parseInt(process.env.STAMP_PRICE_64 || '300'),
  128: parseInt(process.env.STAMP_PRICE_128 || '800'),
};

const CANVAS_SIZE = 2048;
const CHUNK_SIZE = 256;

router.get('/pricing', (req: Request, res: Response) => {
  res.json({
    prices: STAMP_PRICES,
    sizes: [32, 64, 128],
    treasury: process.env.TREASURY_WALLET,
    tokenMint: process.env.MAP_TOKEN_MINT,
  });
});

router.post('/preview', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }
    
    const size = parseInt(req.body.size || '64');
    if (![32, 64, 128].includes(size)) {
      return res.status(400).json({ error: 'Invalid size' });
    }
    
    const processed = await processStampImage(req.file.buffer, size);
    const preview = await generateStampPreview(processed);
    
    res.setHeader('Content-Type', 'image/png');
    res.send(preview);
  } catch (error: any) {
    console.error('Preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/place', upload.single('image'), async (req: Request, res: Response) => {
  try {
    console.log('📍 Stamp placement request');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }
    
    const { wallet, x, y, size, txSignature } = req.body;
    const stampSize = parseInt(size);
    const stampX = parseInt(x);
    const stampY = parseInt(y);
    
    if (!wallet || !txSignature) {
      return res.status(400).json({ error: 'Wallet and transaction signature required' });
    }
    
    if (![32, 64, 128].includes(stampSize)) {
      return res.status(400).json({ error: 'Invalid size' });
    }
    
    if (stampX < 0 || stampY < 0 || stampX + stampSize > CANVAS_SIZE || stampY + stampSize > CANVAS_SIZE) {
      return res.status(400).json({ error: 'Position out of bounds' });
    }
    
    // Verify payment
    const expectedAmount = STAMP_PRICES[stampSize];
    console.log('💰 Verifying payment:', expectedAmount, 'tokens for', stampSize + 'x' + stampSize, 'stamp');
    
    const paymentResult = await verifyPaymentReal(txSignature, wallet, expectedAmount);
    
    if (!paymentResult.valid) {
      console.log('❌ Payment failed:', paymentResult.error);
      return res.status(400).json({ error: paymentResult.error || 'Payment verification failed' });
    }
    
    console.log('✅ Payment verified:', paymentResult.amount, 'base units');
    
    // Record payment
    await recordPayment(txSignature, wallet, 'stamp', expectedAmount);
    
    // Process image
    console.log('🖼️ Processing image...');
    const processed = await processStampImage(req.file.buffer, stampSize);
    console.log('   Generated', processed.pixels.length, 'pixels');
    
    // Group pixels by chunk
    const chunkUpdates = new Map<string, Map<number, number>>();
    
    for (const pixel of processed.pixels) {
      const globalX = stampX + pixel.localX;
      const globalY = stampY + pixel.localY;
      
      const chunkX = Math.floor(globalX / CHUNK_SIZE);
      const chunkY = Math.floor(globalY / CHUNK_SIZE);
      const localX = globalX % CHUNK_SIZE;
      const localY = globalY % CHUNK_SIZE;
      const pixelIndex = localY * CHUNK_SIZE + localX;
      
      const key = chunkX + ':' + chunkY;
      if (!chunkUpdates.has(key)) {
        chunkUpdates.set(key, new Map());
      }
      chunkUpdates.get(key)!.set(pixelIndex, pixel.color);
    }
    
    // OPTIMIZED: Update chunks in batch
    console.log('📝 Updating', chunkUpdates.size, 'chunks (batch mode)...');
    
    for (const [key, pixels] of chunkUpdates) {
      const [chunkX, chunkY] = key.split(':').map(Number);
      
      // Get current chunk data
      const chunk = await queryOne(
        'SELECT data FROM chunks WHERE x = $1 AND y = $2',
        [chunkX, chunkY]
      );
      
      if (chunk && chunk.data) {
        // Modify the buffer directly
        const buffer = Buffer.from(chunk.data);
        
        for (const [index, color] of pixels) {
          buffer[index] = color;
        }
        
        // Single update for the entire chunk
        await execute(
          'UPDATE chunks SET data = $1, updated_at = NOW() WHERE x = $2 AND y = $3',
          [buffer, chunkX, chunkY]
        );
      }
    }
    
    // Record stamp
    await execute(
      'INSERT INTO stamps (wallet, x, y, width, height, tx_sig) VALUES ($1, $2, $3, $4, $5, $6)',
      [wallet, stampX, stampY, stampSize, stampSize, txSignature]
    );
    
    console.log('✅ Stamp placed at (' + stampX + ', ' + stampY + ')');
    
    // Broadcast
    broadcastStamp({
      wallet,
      x: stampX,
      y: stampY,
      width: stampSize,
      height: stampSize,
      timestamp: Date.now(),
    });
    
    res.json({
      success: true,
      stamp: { x: stampX, y: stampY, width: stampSize, height: stampSize },
    });
  } catch (error: any) {
    console.error('❌ Stamp error:', error);
    res.status(500).json({ error: error.message || 'Stamp placement failed' });
  }
});

export default router;