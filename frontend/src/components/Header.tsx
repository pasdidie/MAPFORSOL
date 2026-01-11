import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useStore } from '../store';

// Target: 18 January 2026 at 16:00 Paris time (UTC+1)
const LAUNCH_DATE = new Date('2026-01-18T15:00:00Z'); // 16h Paris = 15h UTC

export function Header() {
  const { publicKey } = useWallet();
  const { setWallet } = useStore();
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isLaunched, setIsLaunched] = useState(false);

  useEffect(() => {
    if (publicKey) {
      setWallet(publicKey.toBase58());
    } else {
      setWallet(null);
    }
  }, [publicKey, setWallet]);

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const diff = LAUNCH_DATE.getTime() - now.getTime();

      if (diff <= 0) {
        setIsLaunched(true);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setIsLaunched(false);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (n: number) => n.toString().padStart(2, '0');

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-sm border-b border-neon-magenta/30">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Logo + X Link */}
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-neon-magenta tracking-wider">$MAP</h1>
          <a
            href="https://x.com/the6sol7map"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span className="text-sm font-medium">Twitter</span>
          </a>
        </div>

        {/* Countdown */}
        <div className="flex flex-col items-center">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            {isLaunched ? 'LAUNCHED' : 'FREE PHASE ENDS IN'}
          </div>
          {!isLaunched ? (
            <div className="flex items-center gap-1 font-mono text-neon-cyan">
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold">{formatNumber(timeLeft.days)}</span>
                <span className="text-[10px] text-gray-500">DAYS</span>
              </div>
              <span className="text-xl text-gray-600">:</span>
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold">{formatNumber(timeLeft.hours)}</span>
                <span className="text-[10px] text-gray-500">HRS</span>
              </div>
              <span className="text-xl text-gray-600">:</span>
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold">{formatNumber(timeLeft.minutes)}</span>
                <span className="text-[10px] text-gray-500">MIN</span>
              </div>
              <span className="text-xl text-gray-600">:</span>
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold">{formatNumber(timeLeft.seconds)}</span>
                <span className="text-[10px] text-gray-500">SEC</span>
              </div>
            </div>
          ) : (
            <div className="text-neon-green font-bold text-lg animate-pulse">
              🚀 LIVE NOW
            </div>
          )}
        </div>

        {/* Wallet */}
        <div className="flex items-center gap-3">
          <WalletMultiButton className="!bg-neon-magenta/20 !border !border-neon-magenta hover:!bg-neon-magenta/30 !rounded-lg !h-10 !font-medium" />
        </div>
      </div>
    </header>
  );
}