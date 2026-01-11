import { Connection, PublicKey } from '@solana/web3.js';
import { execute, queryOne } from '../db/pool';

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'confirmed'
);

const TREASURY_WALLET = process.env.TREASURY_WALLET || '';
const MAP_TOKEN_MINT = process.env.MAP_TOKEN_MINT || '';
const TOKEN_DECIMALS = 6; // pump.fun tokens use 6 decimals

export interface PaymentVerification {
  valid: boolean;
  error?: string;
  amount?: number;
  sender?: string;
}

/**
 * Verify a SPL token transfer transaction on Solana
 */
export async function verifyPayment(
  txSignature: string,
  expectedWallet: string,
  expectedAmount: number
): Promise<PaymentVerification> {
  try {
    console.log('🔍 Verifying transaction:', txSignature);
    
    // Check if transaction already used
    const existing = await queryOne(
      'SELECT id FROM payments WHERE tx_sig = $1',
      [txSignature]
    );
    
    if (existing) {
      return { valid: false, error: 'Transaction already used' };
    }

    // Fetch transaction from Solana
    const tx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { valid: false, error: 'Transaction not found on Solana' };
    }

    if (tx.meta?.err) {
      return { valid: false, error: 'Transaction failed on chain' };
    }

    // Look for SPL token transfer instruction
    const instructions = tx.transaction.message.instructions;
    let transferFound = false;
    let actualAmount = 0;
    let sender = '';

    for (const ix of instructions) {
      if ('parsed' in ix && ix.program === 'spl-token') {
        const parsed = ix.parsed;
        
        if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
          const info = parsed.info;
          
          // Get destination token account info
          const destAccount = info.destination;
          const destInfo = await connection.getParsedAccountInfo(new PublicKey(destAccount));
          
          if (destInfo.value && 'parsed' in destInfo.value.data) {
            const destOwner = destInfo.value.data.parsed.info.owner;
            const mint = destInfo.value.data.parsed.info.mint;
            
            // Check if destination is our treasury and correct token
            if (destOwner === TREASURY_WALLET && mint === MAP_TOKEN_MINT) {
              actualAmount = parseInt(info.amount || info.tokenAmount?.amount || '0');
              sender = info.authority || info.source;
              transferFound = true;
              console.log('✅ Found valid transfer:', { 
                actualAmount, 
                sender, 
                destOwner 
              });
            }
          }
        }
      }
    }

    if (!transferFound) {
      return { valid: false, error: 'No valid token transfer to treasury found in transaction' };
    }

    // Convert expectedAmount (UI units) to base units for comparison
    const expectedBase = expectedAmount * Math.pow(10, TOKEN_DECIMALS);
    
    console.log('💰 Amount check:', {
      actualAmount,
      expectedBase,
      expectedUI: expectedAmount,
      actualUI: actualAmount / Math.pow(10, TOKEN_DECIMALS)
    });

    if (actualAmount < expectedBase) {
      return { 
        valid: false, 
        error: `Insufficient amount: got ${actualAmount / Math.pow(10, TOKEN_DECIMALS)}, expected ${expectedAmount}` 
      };
    }

    console.log('✅ Payment verified successfully');
    return {
      valid: true,
      amount: actualAmount,
      sender,
    };
  } catch (error: any) {
    console.error('❌ Payment verification error:', error);
    return { valid: false, error: error.message };
  }
}

/**
 * Record a verified payment in database
 */
export async function recordPayment(
  txSignature: string,
  wallet: string,
  type: 'stamp' | 'shield',
  amount: number
): Promise<void> {
  await execute(
    'INSERT INTO payments (tx_sig, wallet, type, amount) VALUES ($1, $2, $3, $4)',
    [txSignature, wallet, type, amount]
  );
}

/**
 * Main verification function
 */
export async function verifyPaymentReal(
  txSignature: string,
  expectedWallet: string,
  expectedAmount: number
): Promise<PaymentVerification> {
  return verifyPayment(txSignature, expectedWallet, expectedAmount);
}