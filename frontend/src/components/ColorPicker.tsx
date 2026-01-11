import { useEffect, useState } from 'react';
import { useStore, NEON_PALETTE } from '../store';

export function ColorPicker() {
  const { selectedColor, setSelectedColor, nextPixelAt, wallet } = useStore();
  const [cooldown, setCooldown] = useState('');

  useEffect(() => {
    const update = () => {
      const remaining = Math.max(0, nextPixelAt - Date.now());
      if (remaining <= 0) { setCooldown(''); return; }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setCooldown(`${m}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, [nextPixelAt]);

  if (!wallet) {
    return (
      <div className="fixed bottom-4 right-4 p-4 bg-dark-900/90 border border-neon-cyan/30 rounded-lg">
        <p className="text-sm text-gray-400">Connect wallet to place pixels</p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 p-4 bg-dark-900/90 border border-neon-cyan/30 rounded-lg">
      {cooldown && (
        <div className="mb-3 text-center">
          <span className="text-xs text-gray-400 uppercase">Next pixel in</span>
          <div className="text-2xl font-mono text-neon-magenta">{cooldown}</div>
        </div>
      )}
      <div className="grid grid-cols-8 gap-1">
        {NEON_PALETTE.map((color, i) => (
          <button key={i} onClick={() => setSelectedColor(i)}
            className={`w-7 h-7 rounded ${selectedColor === i ? 'ring-2 ring-white scale-110' : 'hover:scale-105'}`}
            style={{ backgroundColor: color, boxShadow: selectedColor === i ? `0 0 10px ${color}` : 'none' }} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-400">Selected:</span>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded border border-white/20" style={{ backgroundColor: NEON_PALETTE[selectedColor] }}/>
          <span className="font-mono text-xs text-neon-cyan">{NEON_PALETTE[selectedColor]}</span>
        </div>
      </div>
      {!cooldown && <div className="mt-3 text-center text-sm text-green-400">✓ Ready to place</div>}
    </div>
  );
}
