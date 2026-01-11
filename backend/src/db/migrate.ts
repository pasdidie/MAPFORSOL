import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CANVAS_SIZE = 2048;
const CHUNK_SIZE = 256;
const CHUNKS_COUNT = CANVAS_SIZE / CHUNK_SIZE;

const schema = `
CREATE TABLE IF NOT EXISTS users (
  wallet VARCHAR(44) PRIMARY KEY,
  twitter VARCHAR(255),
  last_pixel_at TIMESTAMPTZ,
  last_stamp_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunks (
  x INT NOT NULL,
  y INT NOT NULL,
  data BYTEA NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (x, y)
);

CREATE TABLE IF NOT EXISTS placements (
  id BIGSERIAL PRIMARY KEY,
  wallet VARCHAR(44) NOT NULL,
  x INT NOT NULL,
  y INT NOT NULL,
  color SMALLINT NOT NULL,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_placements_wallet ON placements(wallet);
CREATE INDEX IF NOT EXISTS idx_placements_coords ON placements(x, y);

CREATE TABLE IF NOT EXISTS shields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner VARCHAR(44) NOT NULL,
  x0 INT NOT NULL,
  y0 INT NOT NULL,
  size INT NOT NULL DEFAULT 64,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shields_owner ON shields(owner);
CREATE INDEX IF NOT EXISTS idx_shields_expires ON shields(expires_at);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  tx_sig VARCHAR(88) UNIQUE NOT NULL,
  wallet VARCHAR(44) NOT NULL,
  type VARCHAR(20) NOT NULL,
  amount BIGINT NOT NULL,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stamps (
  id BIGSERIAL PRIMARY KEY,
  wallet VARCHAR(44) NOT NULL,
  x INT NOT NULL,
  y INT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  tx_sig VARCHAR(88),
  ts TIMESTAMPTZ DEFAULT NOW()
);
`;

async function migrate() {
  console.log('Running database migrations...');
  console.log('Canvas size:', CANVAS_SIZE, 'x', CANVAS_SIZE, '(' + CHUNKS_COUNT + 'x' + CHUNKS_COUNT + ' chunks)');
  
  try {
    await pool.query(schema);
    console.log('✅ Tables created');
    
    const emptyChunk = Buffer.alloc(CHUNK_SIZE * CHUNK_SIZE, 0);
    let created = 0;
    
    for (let cx = 0; cx < CHUNKS_COUNT; cx++) {
      for (let cy = 0; cy < CHUNKS_COUNT; cy++) {
        const result = await pool.query(
          'INSERT INTO chunks (x, y, data) VALUES ($1, $2, $3) ON CONFLICT (x, y) DO NOTHING RETURNING x',
          [cx, cy, emptyChunk]
        );
        if (result.rowCount && result.rowCount > 0) created++;
      }
    }
    
    console.log('✅', created, 'new chunks initialized');
    console.log('✅ Database ready!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
