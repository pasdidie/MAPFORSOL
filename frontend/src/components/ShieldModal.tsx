import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useStore } from '../store';
import { createPaymentTransaction, sendAndConfirmPayment } from '../utils/payment';

interface ShieldModalProps {
  onClose: () => void;
  canvasX: number;
  canvasY: number;
  onSuccess?: () => void;
}

const SHIELD_SIZE = 64;

const SHIELD_OPTIONS = [
  { days: 1, price: 50, label: '1 day' },
  { days: 3, price: 120, label: '3 days' },
  { days: 7, price: 200, label: '7 days' },
  { days: 30, price: 500, label: '30 days' },
];

export function ShieldModal({ onClose, canvasX, canvasY, onSuccess }: ShieldModalProps) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const wallet = useStore(s => s.wallet);
  
  const [selectedDuration, setSelectedDuration] = useState<number>(3);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');

  const snapX = Math.floor(canvasX / SHIELD_SIZE) * SHIELD_SIZE;
  const snapY = Math.floor(canvasY / SHIELD_SIZE) * SHIELD_SIZE;

  const selectedOption = SHIELD_OPTIONS.find(o => o.days === selectedDuration)!;

  const handleCreate = async () => {
    if (!wallet || !publicKey || !signTransaction) {
      setError('Please connect your wallet');
      return;
    }

    setProcessing(true);
    setError('');
    setStatus('');
    
    try {
      const amount = selectedOption.price;
      
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
      
      // Step 4: Create shield on backend
      setStatus('Creating shield...');
      
      const res = await fetch('/api/shield/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet,
          x: snapX,
          y: snapY,
          duration: selectedDuration,
          txSignature,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Shield creation failed');
      }
      
      setStatus('✅ Shield created successfully!');
      
      setTimeout(() => {
        onClose();
        onSuccess?.();
      }, 1500);
      
    } catch (err: any) {
      console.error('Shield error:', err);
      
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
        className="bg-[#1a1a1a] border border-neon-cyan/50 rounded-xl p-6 max-w-lg w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-neon-cyan flex items-center gap-2">
            🛡️ Protection Shield
          </h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xl"
          >
            ×
          </button>
        </div>
        
        {/* Preview */}
        <div className="mb-6 p-4 bg-black/30 rounded-lg border border-neon-cyan/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400">Protected area</span>
            <span className="font-mono text-neon-cyan">{SHIELD_SIZE}×{SHIELD_SIZE} pixels</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Position</span>
            <span className="font-mono text-neon-cyan">({snapX}, {snapY})</span>
          </div>
          
          <div className="mt-4 flex justify-center">
            <div 
              className="border-2 border-neon-cyan bg-neon-cyan/10 flex items-center justify-center"
              style={{ width: 80, height: 80 }}
            >
              <span className="text-3xl">🛡️</span>
            </div>
          </div>
        </div>
        
        {/* Duration Selection */}
        <div className="mb-6">
          <div className="text-sm text-gray-400 mb-3">Protection duration</div>
          <div className="grid grid-cols-2 gap-3">
            {SHIELD_OPTIONS.map(option => (
              <button 
                key={option.days} 
                onClick={() => setSelectedDuration(option.days)}
                className={`py-4 rounded-lg border-2 transition-all ${
                  selectedDuration === option.days 
                    ? 'border-neon-cyan bg-neon-cyan/20 text-white' 
                    : 'border-gray-700 hover:border-gray-500 text-gray-400'
                }`}
              >
                <div className="text-lg font-bold">{option.label}</div>
                <div className={`text-sm ${selectedDuration === option.days ? 'text-neon-cyan' : 'text-gray-500'}`}>
                  {option.price} $MAP
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Info */}
        <div className="mb-6 p-3 bg-neon-cyan/5 border border-neon-cyan/20 rounded-lg text-sm text-gray-400">
          <div className="font-medium text-neon-cyan mb-2">Shield protection:</div>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Nobody else can modify pixels in this area</li>
            <li>Only you can draw inside</li>
            <li>One active shield per wallet</li>
          </ul>
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
            onClick={handleCreate} 
            disabled={processing || !wallet}
            className="flex-1 py-3 rounded-lg bg-neon-cyan/20 border border-neon-cyan hover:bg-neon-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold"
          >
            {processing ? 'Processing...' : `Pay ${selectedOption.price} $MAP`}
          </button>
        </div>
      </div>
    </div>
  );
}