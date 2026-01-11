import { useMemo, useEffect } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';

import { Header } from './components/Header';
import { Canvas } from './components/Canvas';
import { ColorPicker } from './components/ColorPicker';
import { useStore } from './store';
import { fetchConfig, getUser } from './utils/api';
import { initPaymentConfig } from './utils/payment';

function AppContent() {
  const { setFreePhaseEnd, wallet, setNextPixelAt } = useStore();

  useEffect(() => {
    fetchConfig().then(c => setFreePhaseEnd(c.freePhaseEnd)).catch(console.error);
    initPaymentConfig();
  }, [setFreePhaseEnd]);

  useEffect(() => {
    if (wallet) {
      getUser(wallet).then(u => u && setNextPixelAt(u.nextPixelAt)).catch(console.error);
    }
  }, [wallet, setNextPixelAt]);

  return (
    <div className="w-full h-full overflow-hidden bg-dark-900">
      <Header />
      <Canvas />
      <ColorPicker />
    </div>
  );
}

export default function App() {
  const endpoint = useMemo(() => 'https://solana-mainnet.g.alchemy.com/v2/If6sDPzw-1Nb0tTP2SxmUQyOQ71X4V8T', []);
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AppContent />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
