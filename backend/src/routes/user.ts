import { Router, Request, Response } from 'express';
import { queryOne, execute } from '../db/pool';

const router = Router();
const COOLDOWN_SECONDS = 60;

router.get('/:wallet', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    
    let user = await queryOne<{ wallet: string; twitter: string | null; last_pixel_at: Date | null }>(
      'SELECT wallet, twitter, last_pixel_at FROM users WHERE wallet = $1',
      [wallet]
    );
    
    if (!user) {
      await execute('INSERT INTO users (wallet) VALUES ($1) ON CONFLICT DO NOTHING', [wallet]);
      user = { wallet, twitter: null, last_pixel_at: null };
    }
    
    const now = Date.now();
    let nextPixelAt = now;
    
    if (user.last_pixel_at) {
      nextPixelAt = Math.max(now, user.last_pixel_at.getTime() + COOLDOWN_SECONDS * 1000);
    }
    
    res.json({ wallet: user.wallet, twitter: user.twitter, nextPixelAt });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
