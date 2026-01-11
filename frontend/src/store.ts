import { create } from 'zustand';

export const NEON_PALETTE = [
  '#000000', '#FFFFFF', '#FF0040', '#FF0080', '#FF00FF', '#C000FF', '#8000FF', '#4000FF',
  '#0040FF', '#0080FF', '#00BFFF', '#00FFFF', '#00FFBF', '#00FF80', '#00FF40', '#00FF00',
  '#40FF00', '#80FF00', '#BFFF00', '#FFFF00', '#FFBF00', '#FF8000', '#FF4000', '#FF6060',
  '#FF80C0', '#C080FF', '#80C0FF', '#80FFC0', '#FFFFA0', '#404040', '#808080', '#C0C0C0',
];

interface Shield {
  id: string;
  owner: string;
  x0: number;
  y0: number;
  size: number;
  expiresAt: number;
}

interface Store {
  // Canvas
  canvasX: number;
  canvasY: number;
  zoom: number;
  selectedColor: number;
  
  // User
  wallet: string | null;
  nextPixelAt: number;
  
  // Game
  freePhaseEnd: number;
  shields: Shield[];
  
  // Actions
  setCanvasPosition: (x: number, y: number) => void;
  setZoom: (z: number) => void;
  setSelectedColor: (c: number) => void;
  setWallet: (w: string | null) => void;
  setNextPixelAt: (t: number) => void;
  setFreePhaseEnd: (t: number) => void;
  setShields: (s: Shield[]) => void;
  addShield: (s: Shield) => void;
}

export const useStore = create<Store>((set) => ({
  canvasX: 1024,
  canvasY: 1024,
  zoom: 1,
  selectedColor: 11,
  wallet: null,
  nextPixelAt: 0,
  freePhaseEnd: Date.now() + 7 * 24 * 60 * 60 * 1000,
  shields: [],
  
  setCanvasPosition: (x, y) => set({ canvasX: x, canvasY: y }),
  setZoom: (z) => set({ zoom: Math.max(0.1, Math.min(40, z)) }),
  setSelectedColor: (c) => set({ selectedColor: c }),
  setWallet: (w) => set({ wallet: w }),
  setNextPixelAt: (t) => set({ nextPixelAt: t }),
  setFreePhaseEnd: (t) => set({ freePhaseEnd: t }),
  setShields: (s) => set({ shields: s }),
  addShield: (s) => set((state) => ({ shields: [...state.shields, s] })),
}));
