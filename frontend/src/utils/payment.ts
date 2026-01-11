import { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram
} from '@solana/web3.js';

// SPL Token Program IDs
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

let TREASURY_WALLET = '';
let MAP_TOKEN_MINT = '';

export async function initPaymentConfig() {
  try {
    const res = await fetch('/api/stamp/pricing');
    const data = await res.json();
    TREASURY_WALLET = data.treasury || '';
    MAP_TOKEN_MINT = data.tokenMint || '';
    console.log('Payment config loaded:', { TREASURY_WALLET, MAP_TOKEN_MINT });
  } catch (err) {
    console.error('Failed to load payment config:', err);
  }
}

export function getTreasuryWallet(): string {
  return TREASURY_WALLET;
}

export function getTokenMint(): string {
  return MAP_TOKEN_MINT;
}

function getAssociatedTokenAddressSync(
  mint: PublicKey,
  owner: PublicKey
): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

async function findTokenAccount(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey
): Promise<{ address: PublicKey; decimals: number } | null> {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
      mint: mint
    });

    if (tokenAccounts.value.length > 0) {
      const account = tokenAccounts.value[0];
      const decimals = account.account.data.parsed.info.tokenAmount.decimals;
      console.log('Found token account:', account.pubkey.toBase58());
      console.log('Balance:', account.account.data.parsed.info.tokenAmount.uiAmount);
      console.log('Decimals:', decimals);
      return { address: account.pubkey, decimals };
    }
    return null;
  } catch (err) {
    console.error('Error finding token account:', err);
    return null;
  }
}

function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.alloc(0),
  });
}

function createTransferInstruction(
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint
): TransactionInstruction {
  const dataLayout = Buffer.alloc(9);
  dataLayout.writeUInt8(3, 0);
  dataLayout.writeBigUInt64LE(amount, 1);

  return new TransactionInstruction({
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    programId: TOKEN_PROGRAM_ID,
    data: dataLayout,
  });
}

export async function createPaymentTransaction(
  connection: Connection,
  payerPublicKey: PublicKey,
  amount: number
): Promise<Transaction> {
  if (!TREASURY_WALLET || !MAP_TOKEN_MINT) {
    throw new Error('Payment not configured. Contact admin.');
  }

  console.log('Creating payment:', amount, 'tokens');
  console.log('Payer wallet:', payerPublicKey.toBase58());

  const treasuryPubkey = new PublicKey(TREASURY_WALLET);
  const mintPubkey = new PublicKey(MAP_TOKEN_MINT);

  const payerTokenInfo = await findTokenAccount(connection, payerPublicKey, mintPubkey);
  
  if (!payerTokenInfo) {
    throw new Error('No $MAP tokens found in your wallet');
  }

  const payerTokenAccount = payerTokenInfo.address;
  const decimals = payerTokenInfo.decimals;
  const treasuryTokenAccount = getAssociatedTokenAddressSync(mintPubkey, treasuryPubkey);

  console.log('Payer token account:', payerTokenAccount.toBase58());
  console.log('Treasury ATA:', treasuryTokenAccount.toBase58());

  const amountBase = BigInt(amount) * BigInt(10 ** decimals);
  console.log('Amount (base units):', amountBase.toString());

  const transaction = new Transaction();

  const treasuryAccountInfo = await connection.getAccountInfo(treasuryTokenAccount);
  if (!treasuryAccountInfo) {
    console.log('Adding instruction to create treasury ATA...');
    transaction.add(
      createAssociatedTokenAccountInstruction(
        payerPublicKey,
        treasuryTokenAccount,
        treasuryPubkey,
        mintPubkey
      )
    );
  }

  transaction.add(
    createTransferInstruction(
      payerTokenAccount,
      treasuryTokenAccount,
      payerPublicKey,
      amountBase
    )
  );

  transaction.feePayer = payerPublicKey;
  const { blockhash } = await connection.getLatestBlockhash('finalized');
  transaction.recentBlockhash = blockhash;

  console.log('Transaction ready for signing');
  return transaction;
}

/**
 * Send transaction and return signature immediately
 * Don't wait for full confirmation - just check it was accepted
 */
export async function sendAndConfirmPayment(
  connection: Connection,
  signedTransaction: Transaction
): Promise<string> {
  console.log('Sending transaction...');
  
  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'processed',
  });

  console.log('TX Signature:', signature);
  console.log('Transaction sent! Checking status...');

  // Quick check - just verify it was received, don't wait for full confirmation
  // This prevents timeout issues with slow RPCs
  try {
    // Wait max 10 seconds for initial confirmation
    const result = await Promise.race([
      connection.confirmTransaction(signature, 'processed'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
    ]);
    console.log('Transaction confirmed!');
  } catch (err) {
    // Even if confirmation times out, the TX might still succeed
    // Check if signature exists
    console.log('Confirmation slow, checking signature status...');
    const status = await connection.getSignatureStatus(signature);
    
    if (status.value?.err) {
      throw new Error('Transaction failed: ' + JSON.stringify(status.value.err));
    }
    
    // If no error, assume success
    console.log('Transaction appears successful, signature:', signature);
  }
  
  return signature;
}