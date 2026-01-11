import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import dotenv from 'dotenv';

import { initWebSocket, getConnectionCount } from './services/websocket';
import canvasRoutes from './routes/canvas';
import stampRoutes from './routes/stamp';
import shieldRoutes from './routes/shield';
import userRoutes from './routes/user';

dotenv.config();

const app = express();
const server = createServer(app);

// IMPORTANT : Render fournit PORT automatiquement
const PORT = Number(process.env.PORT) || 3001;

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    connections: getConnectionCount(),
  });
});

// Routes
app.use('/api/canvas', canvasRoutes);
app.use('/api/stamp', stampRoutes);
app.use('/api/shield', shieldRoutes);
app.use('/api/user', userRoutes);

// WebSocket
initWebSocket(server);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('     $MAP Canvas Server');
  console.log(`     Running on port ${PORT}`);
  console.log('========================================');
});
