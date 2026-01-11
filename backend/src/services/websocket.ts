import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });
  
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`🔌 WebSocket connected. Total: ${clients.size}`);
    
    ws.on('close', () => {
      clients.delete(ws);
      console.log(`🔌 WebSocket disconnected. Total: ${clients.size}`);
    });
    
    ws.on('error', () => clients.delete(ws));
    
    // Heartbeat
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
      else clearInterval(heartbeat);
    }, 30000);
    
    ws.on('close', () => clearInterval(heartbeat));
  });
  
  console.log('✅ WebSocket server initialized');
}

function broadcast(type: string, data: any): void {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export function broadcastPixel(pixel: {
  x: number;
  y: number;
  color: number;
  wallet: string;
}): void {
  broadcast('pixel', pixel);
}

export function broadcastStamp(stamp: {
  wallet: string;
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
}): void {
  broadcast('stamp', stamp);
}

export function broadcastShield(shield: {
  id: string;
  owner: string;
  x0: number;
  y0: number;
  size: number;
  expiresAt: number;
}): void {
  broadcast('shield', shield);
}

export function getConnectionCount(): number {
  return clients.size;
}
