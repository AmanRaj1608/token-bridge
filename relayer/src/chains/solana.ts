import * as web3 from "@solana/web3.js";
import { CONFIG } from "../config";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Setup connection to Solana
export const connection = new web3.Connection(
  CONFIG.solana.rpcUrl,
  "confirmed"
);

// Setup wallet from private key
let keypair: web3.Keypair;

try {
  if (
    CONFIG.solana.privateKey.trim().startsWith("[") &&
    CONFIG.solana.privateKey.trim().endsWith("]")
  ) {
    const privateKeyArray = JSON.parse(CONFIG.solana.privateKey);
    if (Array.isArray(privateKeyArray)) {
      keypair = web3.Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
      console.log("Successfully loaded Solana keypair from JSON array");
    } else {
      throw new Error("Invalid private key array format");
    }
  } else {
    try {
      const bs58 = require("bs58");
      const decoded = bs58.decode(CONFIG.solana.privateKey);
      keypair = web3.Keypair.fromSecretKey(decoded);
      console.log(
        "Successfully loaded Solana keypair from base58 encoded string"
      );
    } catch (bs58Error) {
      try {
        const privateKeyBuffer = Buffer.from(
          CONFIG.solana.privateKey,
          "base64"
        );
        keypair = web3.Keypair.fromSecretKey(privateKeyBuffer);
        console.log(
          "Successfully loaded Solana keypair from base64 encoded string"
        );
      } catch (base64Error) {
        console.error("Error loading Solana private key as base58:", bs58Error);
        console.error(
          "Error loading Solana private key as base64:",
          base64Error
        );
        throw new Error("Could not load private key in any supported format");
      }
    }
  }
} catch (error) {
  console.error("Failed to load Solana private key:", error);
  throw new Error(
    "Invalid Solana private key format. Supported formats: base58 string, base64 string, or JSON array of numbers"
  );
}

export { keypair };

export interface MintParams {
  recipientAddress: string;
  amount: bigint;
  sourceChainTxHash: string;
}

export async function mintTokens(params: MintParams): Promise<string> {
  try {
    const programId = new web3.PublicKey(CONFIG.solana.programId);

    const [bridgePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("flappy_bridge")],
      programId
    );

    const tokenMint = new web3.PublicKey(CONFIG.flappy.solanaTokenAddress);

    const recipientPubkey = new web3.PublicKey(params.recipientAddress);

    const { getAssociatedTokenAddress } = require("@solana/spl-token");

    const recipientTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      recipientPubkey
    );

    const authorityTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      keypair.publicKey
    );

    const recipientAccountInfo = await connection.getAccountInfo(
      recipientTokenAccount
    );
    let transaction = new web3.Transaction();

    if (!recipientAccountInfo) {
      console.log(
        `Creating token account for recipient ${params.recipientAddress}`
      );
      const {
        createAssociatedTokenAccountInstruction,
      } = require("@solana/spl-token");

      const createAccountInstruction = createAssociatedTokenAccountInstruction(
        keypair.publicKey,
        recipientTokenAccount,
        recipientPubkey,
        tokenMint
      );

      transaction.add(createAccountInstruction);
    }

    const COMPLETE_TRANSFER_DISCRIMINATOR = Buffer.from([
      98, 39, 123, 229, 202, 12, 82, 182,
    ]);

    const recipientBuffer = recipientPubkey.toBuffer();

    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64LE(params.amount);

    const sourceChain = "ethereum";
    const sourceChainBuffer = Buffer.from(sourceChain);
    const sourceChainLengthBuffer = Buffer.alloc(4);
    sourceChainLengthBuffer.writeUInt32LE(sourceChainBuffer.length);

    const sourceTxHashBuffer = Buffer.from(params.sourceChainTxHash);
    const sourceTxHashLengthBuffer = Buffer.alloc(4);
    sourceTxHashLengthBuffer.writeUInt32LE(sourceTxHashBuffer.length);

    const instructionData = Buffer.concat([
      COMPLETE_TRANSFER_DISCRIMINATOR,
      recipientBuffer,
      amountBuffer,
      sourceChainLengthBuffer,
      sourceChainBuffer,
      sourceTxHashLengthBuffer,
      sourceTxHashBuffer,
    ]);

    const transferInstruction = new web3.TransactionInstruction({
      keys: [
        { pubkey: bridgePda, isSigner: false, isWritable: false },
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: authorityTokenAccount, isSigner: false, isWritable: true },
        { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
        { pubkey: recipientPubkey, isSigner: false, isWritable: false },
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        {
          pubkey: new web3.PublicKey(
            "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
          ),
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: web3.SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
      programId,
      data: instructionData,
    });

    transaction.add(transferInstruction);

    const signature = await web3.sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair]
    );

    console.log(
      `Minted ${params.amount} tokens to ${params.recipientAddress} on Solana, tx: ${signature}`
    );
    return signature;
  } catch (error) {
    console.error("Error minting tokens on Solana:", error);
    throw error;
  }
}

// Add a function to listen for burn events on Solana
export async function getLatestBurnEvents(lastSignature?: string): Promise<
  Array<{
    from: string;
    value: bigint;
    destinationAddress: string;
    signature: string;
  }>
> {
  try {
    const programId = new web3.PublicKey(CONFIG.solana.programId);

    // Get program transaction signatures
    const signatures = await connection.getSignaturesForAddress(programId, {
      until: lastSignature,
      limit: 100,
    });

    if (signatures.length === 0) {
      return [];
    }

    const burnEvents = [];

    // Process in reverse order (oldest first)
    for (let i = signatures.length - 1; i >= 0; i--) {
      const signature = signatures[i].signature;

      // Get transaction details
      const transaction = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (transaction && isBurnTransaction(transaction)) {
        const burnEvent = parseBurnEvent(transaction);
        burnEvents.push({
          ...burnEvent,
          signature,
        });
      }
    }

    return burnEvents;
  } catch (error) {
    console.error("Error fetching Solana burn events:", error);
    return [];
  }
}

function isBurnTransaction(
  transaction: web3.VersionedTransactionResponse
): boolean {
  if (!transaction || !transaction.meta || !transaction.meta.logMessages) {
    return false;
  }

  return transaction.meta.logMessages.some((log) =>
    log.includes("Instruction: BurnForBridge")
  );
}

function parseBurnEvent(transaction: web3.VersionedTransactionResponse) {
  try {
    if (!transaction || !transaction.meta || !transaction.meta.logMessages) {
      throw new Error("Invalid transaction data");
    }

    const dataLog = transaction.meta.logMessages.find((log) =>
      log.includes("Program data:")
    );

    if (!dataLog) {
      throw new Error("No program data found in transaction logs");
    }

    const base64Data = dataLog.split("Program data:")[1].trim();
    const buffer = Buffer.from(base64Data, "base64");

    let offset = 8;

    const fromPubkey = new web3.PublicKey(buffer.slice(offset, offset + 32));
    offset += 32;

    const destLength = buffer.readUInt32LE(offset);
    offset += 4;

    const destination = buffer
      .slice(offset, offset + destLength)
      .toString("utf8");
    offset += destLength;

    const amount = buffer.readBigUInt64LE(offset);

    return {
      from: fromPubkey.toString(),
      value: amount,
      destinationAddress: destination,
    };
  } catch (error) {
    console.error("Error parsing burn event:", error);
    return {
      from: "error",
      value: BigInt(0),
      destinationAddress: "error",
    };
  }
}
