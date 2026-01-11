import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../db/pool';
import { verifyPaymentDev, recordPayment } from '../services/payment';
import { broadcastShield } from '../services/websocket';

const router = Router();

const SHIELD_SIZE = 64; // Fixed 64x64 shield size
const CANVAS_SIZE = 2048;

// Prices in token base units
const SHIELD_PRICES: Record<string, number> = {
  '1': parseInt(process.env.SHIELD_PRICE_1_DAY || '50'),
  '3': parseInt(process.env.SHIELD_PRICE_3_DAYS || '120'),
  '7': parseInt(process.env.SHIELD_PRICE_7_DAYS || '200'),
  '30': parseInt(process.env.SHIELD_PRICE_30_DAYS || '500'),
};

const SHIELD_DURATIONS: Record<string, number> = {
  '1': 1,
  '3': 3,
  '7': 7,
  '30': 30,
};

export interface Shield {
  id: string;
  owner: string;
  x0: number;
  y0: number;
  size: number;
  expiresAt: number;
  createdAt: number;
}

// Get pricing info
router.get('/pricing', (req: Request, res: Response) => {
  res.json({
    prices: SHIELD_PRICES,
    durations: SHIELD_DURATIONS,
    size: SHIELD_SIZE,
    treasury: process.env.TREASURY_WALLET,
    tokenMint: process.env.MAP_TOKEN_MINT,
  });
});

// Get all active shields
router.get('/active', async (req: Request, res: Response) => {
  try {
    const results = await query<{
      id: string;
      owner: string;
      x0: number;
      y0: number;
      size: number;
      expires_at: Date;
      created_at: Date;
    }>('SELECT id, owner, x0, y0, size, expires_at, created_at FROM shields WHERE expires_at > NOW()');
    
    const shields: Shield[] = results.map(r => ({
      id: r.id,
      owner: r.owner,
      x0: r.x0,
      y0: r.y0,
      size: r.size,
      expiresAt: r.expires_at.getTime(),
      createdAt: r.created_at.getTime(),
    }));
    
    res.json(shields);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch shields' });
  }
});

// Get user's active shield
router.get('/user/:wallet', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    
    const result = await queryOne<{
      id: string;
      owner: string;
      x0: number;
      y0: number;
      size: number;
      expires_at: Date;
      created_at: Date;
    }>(
      'SELECT id, owner, x0, y0, size, expires_at, created_at FROM shields WHERE owner = $1 AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1',
      [wallet]
    );
    
    if (!result) {
      return res.json({ shield: null });
    }
    
    res.json({
      shield: {
        id: result.id,
        owner: result.owner,
        x0: result.x0,
        y0: result.y0,
        size: result.size,
        expiresAt: result.expires_at.getTime(),
        createdAt: result.created_at.getTime(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch user shield' });
  }
});

// Check if position is shielded
router.get('/check/:x/:y', async (req: Request, res: Response) => {
  try {
    const x = parseInt(req.params.x);
    const y = parseInt(req.params.y);
    
    const result = await queryOne<{
      id: string;
      owner: string;
      x0: number;
      y0: number;
      size: number;
      expires_at: Date;
    }>(
      `SELECT id, owner, x0, y0, size, expires_at FROM shields 
       WHERE expires_at > NOW() 
       AND $1 >= x0 AND $1 < x0 + size 
       AND $2 >= y0 AND $2 < y0 + size 
       LIMIT 1`,
      [x, y]
    );
    
    if (!result) {
      return res.json({ shielded: false });
    }
    
    res.json({
      shielded: true,
      shield: {
        id: result.id,
        owner: result.owner,
        x0: result.x0,
        y0: result.y0,
        size: result.size,
        expiresAt: result.expires_at.getTime(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to check shield' });
  }
});

// Create shield with payment
router.post('/create', async (req: Request, res: Response) => {
  try {
    console.log('🛡️ Shield creation request');
    
    const { wallet, x, y, duration, txSignature } = req.body;
    
    // Validate inputs
    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ error: 'Valid wallet address required' });
    }
    
    if (!txSignature || typeof txSignature !== 'string') {
      return res.status(400).json({ error: 'Transaction signature required' });
    }
    
    const durationKey = String(duration);
    if (!SHIELD_DURATIONS[durationKey]) {
      return res.status(400).json({ error: 'Invalid duration. Must be 1, 3, 7, or 30 days' });
    }
    
    // Snap to grid (64x64)
    const shieldX = Math.floor(parseInt(x) / SHIELD_SIZE) * SHIELD_SIZE;
    const shieldY = Math.floor(parseInt(y) / SHIELD_SIZE) * SHIELD_SIZE;
    
    // Check bounds
    if (shieldX < 0 || shieldY < 0 || shieldX + SHIELD_SIZE > CANVAS_SIZE || shieldY + SHIELD_SIZE > CANVAS_SIZE) {
      return res.status(400).json({ error: `Position out of bounds. Canvas is ${CANVAS_SIZE}x${CANVAS_SIZE}` });
    }
    
    // Check if user already has active shield
    const existingShield = await queryOne(
      'SELECT id FROM shields WHERE owner = $1 AND expires_at > NOW()',
      [wallet]
    );
    
    if (existingShield) {
      return res.status(400).json({ error: 'You already have an active shield. Wait for it to expire.' });
    }
    
    // Check if position overlaps with existing shield
    const overlapping = await queryOne(
      `SELECT id, owner FROM shields 
       WHERE expires_at > NOW()
       AND NOT ($1 + $2 <= x0 OR $1 >= x0 + size OR $3 + $2 <= y0 OR $3 >= y0 + size)`,
      [shieldX, SHIELD_SIZE, shieldY]
    );
    
    if (overlapping) {
      return res.status(400).json({ error: 'This area overlaps with an existing shield' });
    }
    
    // Verify payment
    const expectedAmount = SHIELD_PRICES[durationKey];
    console.log(`💰 Verifying payment: ${expectedAmount} tokens for ${duration} day shield`);
    
    const paymentResult = await verifyPaymentDev(txSignature, wallet, expectedAmount);
    
    if (!paymentResult.valid) {
      console.log(`❌ Payment invalid: ${paymentResult.error}`);
      return res.status(400).json({ error: paymentResult.error || 'Payment verification failed' });
    }
    
    console.log(`✅ Payment verified`);
    
    // Record payment
    await recordPayment(txSignature, wallet, 'shield', expectedAmount);
    
    // Calculate expiration
    const durationDays = SHIELD_DURATIONS[durationKey];
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    
    // Create shield
    const result = await queryOne<{ id: string; created_at: Date }>(
      `INSERT INTO shields (owner, x0, y0, size, expires_at) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, created_at`,
      [wallet, shieldX, shieldY, SHIELD_SIZE, expiresAt]
    );
    
    console.log(`✅ Shield created at (${shieldX}, ${shieldY}) for ${durationDays} days`);
    
    const shield: Shield = {
      id: result!.id,
      owner: wallet,
      x0: shieldX,
      y0: shieldY,
      size: SHIELD_SIZE,
      expiresAt: expiresAt.getTime(),
      createdAt: result!.created_at.getTime(),
    };
    
    // Broadcast to connected clients
    broadcastShield(shield);
    
    res.json({
      success: true,
      shield,
    });
  } catch (error: any) {
    console.error('❌ Shield error:', error);
    res.status(500).json({ error: error.message || 'Shield creation failed' });
  }
});

export default router;
