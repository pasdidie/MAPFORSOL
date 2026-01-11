import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useStore } from '../store';
import { createPaymentTransaction, sendAndConfirmPayment } from '../utils/payment';

interface StampModalProps {
  onClose: () => void;
  canvasX: number;
  canvasY: number;
  onSuccess?: () => void;
}

const STAMP_PRICES: Record<number, number> = {
  32: 100,
  64: 300,
  128: 800,
};

export function StampModal({ onClose, canvasX, canvasY, onSuccess }: StampModalProps) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const wallet = useStore(s => s.wallet);
  
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [size, setSize] = useState<32 | 64 | 128>(64);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');

  const snapX = Math.floor(canvasX / size) * size;
  const snapY = Math.floor(canvasY / size) * size;

  // Load preview when file or size changes
  useEffect(() => {
    if (!file) return;
    
    const loadPreview = async () => {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('size', size.toString());
      
      try {
        const res = await fetch('/api/stamp/preview', { method: 'POST', body: formData });
        if (res.ok) {
          const blob = await res.blob();
          setPreview(URL.createObjectURL(blob));
          setError('');
        } else {
          setError('Failed to generate preview');
        }
      } catch (err) {
        setError('Failed to connect to server');
      }
    };
    
    loadPreview();
  }, [file, size]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > 5 * 1024 * 1024) {
        setError('File too large (max 5MB)');
        return;
      }
      setFile(f);
      setError('');
    }
  };

  const handlePlace = async () => {
    if (!file || !wallet || !publicKey || !signTransaction) {
      setError('Please connect your wallet');
      return;
    }

    setProcessing(true);
    setError('');
    setStatus('');
    
    try {
      const amount = STAMP_PRICES[size];
      
      // Step 1: Create payment transaction
      setStatus('Creating payment transaction...');
      const transaction = await createPaymentTransaction(connection, publicKey, amount);
      
      // Step 2: Request wallet signature
      setStatus('Please approve the transaction in your wallet...');
      const signedTransaction = await signTransaction(transaction);
      
      // Step 3: Send and confirm transaction
      setStatus('Sending transaction to Solana...');
      const txSignature = await sendAndConfirmPayment(connection, signedTransaction);
      
      console.log('Payment confirmed:', txSignature);
      
      // Step 4: Place the stamp on backend
      setStatus('Placing stamp on canvas...');
      
      const formData = new FormData();
      formData.append('image', file);
      formData.append('wallet', wallet);
      formData.append('x', snapX.toString());
      formData.append('y', snapY.toString());
      formData.append('size', size.toString());
      formData.append('txSignature', txSignature);
      
      const res = await fetch('/api/stamp/place', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Stamp placement failed');
      }
      
      setStatus('✅ Stamp placed successfully!');
      
      setTimeout(() => {
        onClose();
        onSuccess?.();
      }, 1500);
      
    } catch (err: any) {
      console.error('Stamp error:', err);
      
      // User-friendly error messages
      if (err.message?.includes('User rejected')) {
        setError('Transaction cancelled by user');
      } else if (err.message?.includes('Insufficient')) {
        setError(err.message);
      } else if (err.message?.includes('Token account not found')) {
        setError('You need $MAP tokens in your wallet');
      } else {
        setError(err.message || 'An error occurred');
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-[#1a1a1a] border border-neon-magenta/50 rounded-xl p-6 max-w-lg w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-neon-magenta flex items-center gap-2">
            🖼️ Image Stamp
          </h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xl"
          >
            ×
          </button>
        </div>
        
        {/* File Upload */}
        <div 
          className="border-2 border-dashed border-neon-magenta/30 rounded-xl p-6 text-center cursor-pointer hover:border-neon-magenta/60 transition-colors mb-6"
          onClick={() => document.getElementById('stamp-file')?.click()}
        >
          {preview ? (
            <div className="flex flex-col items-center">
              <img 
                src={preview} 
                alt="Preview" 
                className="max-w-[200px] max-h-[200px] rounded border border-white/10" 
                style={{ imageRendering: 'pixelated' }} 
              />
              <p className="mt-2 text-sm text-gray-400">Click to change image</p>
            </div>
          ) : (
            <div className="text-gray-400 py-4">
              <div className="text-5xl mb-3">📁</div>
              <div className="text-lg">Click to choose an image</div>
              <div className="text-sm text-gray-500 mt-1">PNG, JPG, WebP (max 5MB)</div>
            </div>
          )}
        </div>
        <input id="stamp-file" type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        
        {/* Size Selection */}
        <div className="mb-6">
          <div className="text-sm text-gray-400 mb-3">Stamp size</div>
          <div className="grid grid-cols-3 gap-3">
            {([32, 64, 128] as const).map(s => (
              <button 
                key={s} 
                onClick={() => setSize(s)}
                className={`py-3 rounded-lg border-2 transition-all ${
                  size === s 
                    ? 'border-neon-magenta bg-neon-magenta/20 text-white' 
                    : 'border-gray-700 hover:border-gray-500 text-gray-400'
                }`}
              >
                <div className="text-lg font-bold">{s}×{s}</div>
                <div className={`text-sm ${size === s ? 'text-neon-magenta' : 'text-gray-500'}`}>
                  {STAMP_PRICES[s]} $MAP
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Position */}
        <div className="mb-6 p-4 bg-black/30 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Position</span>
            <span className="font-mono text-neon-cyan">({snapX}, {snapY})</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Snapped to {size}×{size} grid
          </div>
        </div>
        
        {/* Status */}
        {status && !error && (
          <div className="mb-4 p-3 bg-neon-cyan/10 border border-neon-cyan/30 rounded-lg text-neon-cyan text-sm flex items-center gap-2">
            {status.startsWith('✅') ? null : <div className="animate-spin">⏳</div>}
            {status}
          </div>
        )}
        
        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            ❌ {error}
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-3">
          <button 
            onClick={onClose} 
            disabled={processing}
            className="flex-1 py-3 rounded-lg border border-gray-600 hover:bg-white/5 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handlePlace} 
            disabled={!file || processing || !wallet}
            className="flex-1 py-3 rounded-lg bg-neon-magenta/20 border border-neon-magenta hover:bg-neon-magenta/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold"
          >
            {processing ? 'Processing...' : `Pay ${STAMP_PRICES[size]} $MAP`}
          </button>
        </div>
        
        {/* Info */}
        <div className="mt-4 text-center text-xs text-gray-500">
          💡 The image will be converted to pixel art with 32 colors
        </div>
      </div>
    </div>
  );
}