import { useRef, useEffect, useCallback, useState } from 'react';
import { useStore, NEON_PALETTE } from '../store';
import { fetchChunk, placePixel } from '../utils/api';
import { StampModal } from './StampModal';

const CANVAS_SIZE = 2048;
const CHUNK_SIZE = 256;

const PALETTE_RGB = NEON_PALETTE.map(hex => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
}));

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const chunkDataRef = useRef<Map<string, Uint8Array>>(new Map());
  const chunkBitmapRef = useRef<Map<string, ImageBitmap>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());
  const minimapDirtyRef = useRef(true);
  
  const [isDragging, setIsDragging] = useState(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const [showMinimap, setShowMinimap] = useState(true);
  const [showStampModal, setShowStampModal] = useState(false);
  const [stampPosition, setStampPosition] = useState({ x: 0, y: 0 });
  
  const { canvasX, canvasY, zoom, selectedColor, wallet, nextPixelAt,
          setCanvasPosition, setZoom, setNextPixelAt } = useStore();

  useEffect(() => {
    const resize = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const createChunkBitmap = useCallback(async (key: string, data: Uint8Array) => {
    const imageData = new ImageData(CHUNK_SIZE, CHUNK_SIZE);
    const pixels = imageData.data;
    
    for (let i = 0; i < data.length; i++) {
      const color = PALETTE_RGB[data[i]] || PALETTE_RGB[0];
      const offset = i * 4;
      pixels[offset] = color.r;
      pixels[offset + 1] = color.g;
      pixels[offset + 2] = color.b;
      pixels[offset + 3] = 255;
    }
    
    const bitmap = await createImageBitmap(imageData);
    chunkBitmapRef.current.set(key, bitmap);
    minimapDirtyRef.current = true;
    return bitmap;
  }, []);

  const loadChunk = useCallback(async (cx: number, cy: number) => {
    const key = cx + ':' + cy;
    if (chunkDataRef.current.has(key) || loadingRef.current.has(key)) return;
    
    loadingRef.current.add(key);
    try {
      const data = await fetchChunk(cx, cy);
      chunkDataRef.current.set(key, data);
      await createChunkBitmap(key, data);
    } catch (e) {
      console.error('Failed to load chunk', key);
    }
    loadingRef.current.delete(key);
  }, [createChunkBitmap]);

  const updatePixelInChunk = useCallback(async (x: number, y: number, color: number) => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const key = cx + ':' + cy;
    
    const data = chunkDataRef.current.get(key);
    if (data) {
      const localX = x % CHUNK_SIZE;
      const localY = y % CHUNK_SIZE;
      data[localY * CHUNK_SIZE + localX] = color;
      
      const oldBitmap = chunkBitmapRef.current.get(key);
      if (oldBitmap) oldBitmap.close();
      await createChunkBitmap(key, data);
    }
  }, [createChunkBitmap]);

  const reloadAllChunks = useCallback(async () => {
    const keys = Array.from(chunkDataRef.current.keys());
    for (const key of keys) {
      const [cx, cy] = key.split(':').map(Number);
      loadingRef.current.delete(key);
      chunkDataRef.current.delete(key);
      const oldBitmap = chunkBitmapRef.current.get(key);
      if (oldBitmap) oldBitmap.close();
      chunkBitmapRef.current.delete(key);
    }
    for (const key of keys) {
      const [cx, cy] = key.split(':').map(Number);
      await loadChunk(cx, cy);
    }
  }, [loadChunk]);

  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = canvasX + (screenX - rect.left - canvas.width / 2) / zoom;
    const y = canvasY + (screenY - rect.top - canvas.height / 2) / zoom;
    return { x: Math.floor(x), y: Math.floor(y) };
  }, [canvasX, canvasY, zoom]);

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animId: number;
    
    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, w, h);
      
      ctx.imageSmoothingEnabled = zoom < 4;
      
      const startX = Math.max(0, Math.floor((canvasX - w / 2 / zoom) / CHUNK_SIZE));
      const startY = Math.max(0, Math.floor((canvasY - h / 2 / zoom) / CHUNK_SIZE));
      const endX = Math.min(Math.ceil(CANVAS_SIZE / CHUNK_SIZE) - 1, Math.ceil((canvasX + w / 2 / zoom) / CHUNK_SIZE));
      const endY = Math.min(Math.ceil(CANVAS_SIZE / CHUNK_SIZE) - 1, Math.ceil((canvasY + h / 2 / zoom) / CHUNK_SIZE));
      
      for (let cy = startY; cy <= endY; cy++) {
        for (let cx = startX; cx <= endX; cx++) {
          const key = cx + ':' + cy;
          const bitmap = chunkBitmapRef.current.get(key);
          
          const screenX = w / 2 + (cx * CHUNK_SIZE - canvasX) * zoom;
          const screenY = h / 2 + (cy * CHUNK_SIZE - canvasY) * zoom;
          const size = CHUNK_SIZE * zoom;
          
          if (bitmap) {
            ctx.drawImage(bitmap, screenX, screenY, size, size);
          } else {
            loadChunk(cx, cy);
            ctx.fillStyle = '#111';
            ctx.fillRect(screenX, screenY, size, size);
          }
        }
      }
      
      // Grid
      if (zoom >= 8) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        const gridStartX = Math.floor((canvasX - w / 2 / zoom));
        const gridStartY = Math.floor((canvasY - h / 2 / zoom));
        const gridEndX = Math.ceil((canvasX + w / 2 / zoom));
        const gridEndY = Math.ceil((canvasY + h / 2 / zoom));
        
        for (let x = gridStartX; x <= gridEndX; x++) {
          const sx = w / 2 + (x - canvasX) * zoom;
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, h);
        }
        for (let y = gridStartY; y <= gridEndY; y++) {
          const sy = h / 2 + (y - canvasY) * zoom;
          ctx.moveTo(0, sy);
          ctx.lineTo(w, sy);
        }
        ctx.stroke();
      }
      
      // Crosshair
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 12, h / 2);
      ctx.lineTo(w / 2 + 12, h / 2);
      ctx.moveTo(w / 2, h / 2 - 12);
      ctx.lineTo(w / 2, h / 2 + 12);
      ctx.stroke();
      
      animId = requestAnimationFrame(render);
    };
    
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [canvasX, canvasY, zoom, loadChunk]);

  // Minimap render
  useEffect(() => {
    if (!showMinimap) return;
    
    const minimap = minimapRef.current;
    if (!minimap) return;
    
    const ctx = minimap.getContext('2d');
    if (!ctx) return;
    
    const size = 150;
    const scale = size / CANVAS_SIZE;
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, size, size);
    
    chunkDataRef.current.forEach((data, key) => {
      const [cx, cy] = key.split(':').map(Number);
      for (let ly = 0; ly < CHUNK_SIZE; ly += 32) {
        for (let lx = 0; lx < CHUNK_SIZE; lx += 32) {
          const idx = ly * CHUNK_SIZE + lx;
          const colorIdx = data[idx];
          if (colorIdx > 0) {
            ctx.fillStyle = NEON_PALETTE[colorIdx];
            ctx.fillRect((cx * CHUNK_SIZE + lx) * scale, (cy * CHUNK_SIZE + ly) * scale, 3, 3);
          }
        }
      }
    });
    
    // Viewport
    const canvas = canvasRef.current;
    if (canvas) {
      const viewW = Math.max(4, canvas.width / zoom * scale);
      const viewH = Math.max(4, canvas.height / zoom * scale);
      const viewX = (canvasX - canvas.width / 2 / zoom) * scale;
      const viewY = (canvasY - canvas.height / 2 / zoom) * scale;
      
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(viewX, viewY, viewW, viewH);
    }
  }, [canvasX, canvasY, zoom, showMinimap]);

  // Mouse wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.8 : 1.25;
      setZoom(Math.max(0.05, Math.min(50, zoom * factor)));
    };
    
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [zoom, setZoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      setCanvasPosition(canvasX - dx / zoom, canvasY - dy / zoom);
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleClick = async (e: React.MouseEvent) => {
    if (!wallet || isDragging) return;
    if (Date.now() < nextPixelAt) return;
    
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    if (x < 0 || x >= CANVAS_SIZE || y < 0 || y >= CANVAS_SIZE) return;
    
    try {
      const result = await placePixel(wallet, x, y, selectedColor);
      await updatePixelInChunk(x, y, selectedColor);
      setNextPixelAt(result.nextPixelAt);
    } catch (err: any) {
      console.error(err.message);
    }
  };

  const handleMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / 150 * CANVAS_SIZE;
    const y = (e.clientY - rect.top) / 150 * CANVAS_SIZE;
    setCanvasPosition(x, y);
  };

  const zoomToFit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setZoom(Math.min(canvas.width, canvas.height) / CANVAS_SIZE);
    setCanvasPosition(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
  };

  const openStampModal = () => {
    setStampPosition({ x: Math.floor(canvasX), y: Math.floor(canvasY) });
    setShowStampModal(true);
  };

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ top: 60 }}>
      <canvas
        ref={canvasRef}
        className={'w-full h-full ' + (isDragging ? 'cursor-grabbing' : wallet ? 'cursor-crosshair' : 'cursor-grab')}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />
      
      {/* Controls */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <button onClick={() => setZoom(Math.min(50, zoom * 1.5))}
          className="w-10 h-10 bg-dark-900/90 border border-neon-cyan/50 rounded hover:border-neon-cyan text-neon-cyan text-xl font-bold">+</button>
        <button onClick={() => setZoom(Math.max(0.05, zoom / 1.5))}
          className="w-10 h-10 bg-dark-900/90 border border-neon-cyan/50 rounded hover:border-neon-cyan text-neon-cyan text-xl font-bold">−</button>
        <button onClick={zoomToFit}
          className="w-10 h-10 bg-dark-900/90 border border-neon-magenta/50 rounded hover:border-neon-magenta text-neon-magenta text-[10px] font-bold" title="View all">MAP</button>
        <button onClick={() => { setZoom(1); setCanvasPosition(CANVAS_SIZE/2, CANVAS_SIZE/2); }}
          className="w-10 h-10 bg-dark-900/90 border border-neon-cyan/50 rounded hover:border-neon-cyan text-neon-cyan text-xs font-bold">1:1</button>
        
        {/* Stamp button */}
        {wallet && (
          <button onClick={openStampModal}
            className="w-10 h-10 bg-dark-900/90 border border-neon-magenta/50 rounded hover:border-neon-magenta text-xl" title="Place Image Stamp">
            🖼️
          </button>
        )}
      </div>
      
      {/* Minimap */}
      {showMinimap && (
        <div className="absolute top-4 right-4">
          <canvas ref={minimapRef} width={150} height={150}
            className="border border-neon-cyan/50 rounded cursor-pointer bg-dark-900/90"
            onClick={handleMinimapClick} />
          <button onClick={() => setShowMinimap(false)}
            className="absolute -top-1 -right-1 w-5 h-5 bg-dark-900 border border-gray-600 rounded-full text-gray-400 text-xs hover:text-white">×</button>
        </div>
      )}
      {!showMinimap && (
        <button onClick={() => setShowMinimap(true)}
          className="absolute top-4 right-4 px-2 py-1 bg-dark-900/90 border border-neon-cyan/50 rounded text-xs text-neon-cyan">Map</button>
      )}
      
      {/* Coordinates */}
      <div className="absolute bottom-4 left-4 px-3 py-2 bg-dark-900/90 border border-neon-cyan/30 rounded font-mono text-xs">
        <span className="text-gray-400">X:</span> <span className="text-neon-cyan">{Math.floor(canvasX)}</span>
        <span className="mx-2 text-gray-600">|</span>
        <span className="text-gray-400">Y:</span> <span className="text-neon-cyan">{Math.floor(canvasY)}</span>
        <span className="mx-2 text-gray-600">|</span>
        <span className="text-gray-400">Zoom:</span> <span className="text-neon-magenta">{zoom < 1 ? zoom.toFixed(3) : zoom.toFixed(1)}x</span>
      </div>
      
      {/* Stamp Modal */}
      {showStampModal && (
        <StampModal
          onClose={() => setShowStampModal(false)}
          canvasX={stampPosition.x}
          canvasY={stampPosition.y}
          onSuccess={reloadAllChunks}
        />
      )}
    </div>
  );
}