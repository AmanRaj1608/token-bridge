import * as web3 from '@solana/web3.js';
import { CONFIG } from '../config';
import { getSpl20Program } from '../utils';

// Setup connection to Solana
export const connection = new web3.Connection(CONFIG.solana.rpcUrl, 'confirmed');

// Setup wallet from private key
let keypair: web3.Keypair;

try {
  // Check if the key is in JSON array format
  if (CONFIG.solana.privateKey.trim().startsWith('[') && CONFIG.solana.privateKey.trim().endsWith(']')) {
    const privateKeyArray = JSON.parse(CONFIG.solana.privateKey);
    if (Array.isArray(privateKeyArray)) {
      keypair = web3.Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
      console.log('Successfully loaded Solana keypair from JSON array');
    } else {
      throw new Error('Invalid private key array format');
    }
  } else {
    // Try to decode as base58 private key (Solana CLI default format)
    try {
      // For Phantom-style private keys (base58 encoded)
      const bs58 = require('bs58');
      const decoded = bs58.decode(CONFIG.solana.privateKey);
      keypair = web3.Keypair.fromSecretKey(decoded);
      console.log('Successfully loaded Solana keypair from base58 encoded string');
    } catch (bs58Error) {
      // Try base64 as fallback
      try {
        const privateKeyBuffer = Buffer.from(CONFIG.solana.privateKey, 'base64');
        keypair = web3.Keypair.fromSecretKey(privateKeyBuffer);
        console.log('Successfully loaded Solana keypair from base64 encoded string');
      } catch (base64Error) {
        console.error('Error loading Solana private key as base58:', bs58Error);
        console.error('Error loading Solana private key as base64:', base64Error);
        throw new Error('Could not load private key in any supported format');
      }
    }
  }
} catch (error) {
  console.error('Failed to load Solana private key:', error);
  throw new Error('Invalid Solana private key format. Supported formats: base58 string, base64 string, or JSON array of numbers');
}

export { keypair };

export interface MintParams {
  recipientAddress: string;
  amount: bigint;
  sourceChainTxHash: string;
}

export async function mintTokens(params: MintParams): Promise<string> {
  try {
    // Prepare mint instruction
    const spl20Program = getSpl20Program();
    const programId = new web3.PublicKey(CONFIG.solana.programId);
    
    // Convert recipient address to Solana public key
    const recipientPubkey = new web3.PublicKey(params.recipientAddress);
    
    // Build transaction
    const transaction = new web3.Transaction();
    
    // The token mint instruction (specific to SPL20 implementation)
    // This will vary based on the actual program structure
    const mintInstruction = new web3.TransactionInstruction({
      keys: [
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: recipientPubkey, isSigner: false, isWritable: true },
      ],
      programId,
      data: Buffer.from([
        /* Mint instruction with appropriate encoding for your SPL20 program */
        /* This should include amount and possibly source transaction hash */
      ]),
    });
    
    transaction.add(mintInstruction);
    
    // Sign and send transaction
    const signature = await web3.sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair]
    );
    
    console.log(`Minted ${params.amount} tokens to ${params.recipientAddress} on Solana, tx: ${signature}`);
    return signature;
  } catch (error) {
    console.error('Error minting tokens on Solana:', error);
    throw error;
  }
}

// Add a function to listen for burn events on Solana
export async function getLatestBurnEvents(lastSignature?: string): Promise<Array<{
  from: string;
  value: bigint;
  destinationAddress: string;
  signature: string;
}>> {
  try {
    const programId = new web3.PublicKey(CONFIG.solana.programId);
    
    // Get program transaction signatures
    const signatures = await connection.getSignaturesForAddress(
      programId,
      { until: lastSignature, limit: 100 }
    );
    
    if (signatures.length === 0) {
      return [];
    }
    
    const burnEvents = [];
    
    // Process in reverse order (oldest first)
    for (let i = signatures.length - 1; i >= 0; i--) {
      const signature = signatures[i].signature;
      
      // Get transaction details
      const transaction = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });
      
      // This is simplified - in a real implementation, you would need to:
      // 1. Parse the transaction to identify burn instructions
      // 2. Extract the burn amount and destination Ethereum address
      // This depends on your specific SPL20 program structure
      if (transaction && isBurnTransaction(transaction)) {
        const burnEvent = parseBurnEvent(transaction);
        burnEvents.push({
          ...burnEvent,
          signature
        });
      }
    }
    
    return burnEvents;
  } catch (error) {
    console.error('Error fetching Solana burn events:', error);
    return [];
  }
}

// Helper functions (implementation depends on your specific program)
function isBurnTransaction(transaction: web3.ParsedTransactionWithMeta): boolean {
  // Check if this transaction is a burn operation
  // This is a placeholder - actual implementation depends on your program
  return false; // Replace with actual logic
}

function parseBurnEvent(transaction: web3.ParsedTransactionWithMeta) {
  // Extract burn details from transaction
  // This is a placeholder - actual implementation depends on your program
  return {
    from: 'solanaAddress',
    value: BigInt(0),
    destinationAddress: 'ethereumAddress'
  };
}
