import * as web3 from "@solana/web3.js";
import { program } from "commander";
import dotenv from "dotenv";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CONFIG } from "../config";

dotenv.config();

program
  .option("-a, --amount <number>", "Amount of tokens to transfer")
  .option("-d, --destination <address>", "Destination Ethereum address")
  .parse(process.argv);

const options = program.opts();

// Anchor instruction discriminators
const DEPOSIT_DISCRIMINATOR = Buffer.from([
  242, 35, 198, 137, 82, 225, 242, 182,
]); // From IDL
const BURN_FOR_BRIDGE_DISCRIMINATOR = Buffer.from([
  154, 75, 127, 142, 125, 122, 193, 67,
]); // From IDL

async function main() {
  if (!options.amount || !options.destination) {
    console.error("Error: Both amount and destination are required");
    process.exit(1);
  }

  // Validate Ethereum address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(options.destination)) {
    console.error(
      "Error: Invalid Ethereum address format. Must start with 0x followed by 40 hex characters."
    );
    process.exit(1);
  }

  // Configure connection
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new web3.Connection(rpcUrl, "confirmed");

  // Load the program
  const programId = new web3.PublicKey(
    process.env.SOLANA_BRIDGE_ADDRESS || CONFIG.flappy.solanaBridgeAddress
  );

  // Set up wallet from local Solana config file
  let keypair: web3.Keypair;
  try {
    const homeDir = os.homedir();
    const walletPath = path.join(homeDir, ".config/solana/id.json");
    console.log(`Loading wallet from ${walletPath}`);

    const walletKeyData = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
    keypair = web3.Keypair.fromSecretKey(Uint8Array.from(walletKeyData));
    console.log("Wallet loaded successfully");
  } catch (error) {
    console.error("Failed to load wallet:", error);
    process.exit(1);
  }

  try {
    console.log("User wallet:", keypair.publicKey.toString());

    // Find bridge PDA
    const [bridgePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("flappy_bridge")],
      programId
    );

    console.log("Bridge PDA:", bridgePda.toString());
    console.log("Program ID:", programId.toString());

    // Get token mint (from environment or config)
    const tokenMint = new web3.PublicKey(
      process.env.TOKEN_MINT || CONFIG.flappy.solanaTokenAddress
    );
    console.log("Token mint:", tokenMint.toString());

    // Get token accounts
    const userTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      keypair.publicKey
    );

    const bridgeTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      bridgePda,
      true // allowOwnerOffCurve
    );

    console.log("User token account:", userTokenAccount.toString());
    console.log("Bridge token account:", bridgeTokenAccount.toString());

    // Check user token balance
    try {
      const tokenBalance = await connection.getTokenAccountBalance(
        userTokenAccount
      );
      console.log(`Token balance: ${tokenBalance.value.uiAmount} tokens`);

      if ((tokenBalance.value.uiAmount || 0) < Number(options.amount)) {
        console.error(
          `Error: Insufficient token balance. You need at least ${options.amount} tokens`
        );
        process.exit(1);
      }
    } catch (error) {
      console.error("Failed to get token balance:", error);
      console.log("Make sure your token account exists and has tokens");
      process.exit(1);
    }

    // Step 1: Deposit to bridge
    // Calculate amount with decimals
    const amount = BigInt(Number(options.amount) * 1_000_000); // 6 decimals

    console.log("Loading IDL to get instruction format");
    // Look at the program accounts to understand which to use
    const programAccounts = await connection.getProgramAccounts(programId);
    console.log(`Found ${programAccounts.length} program accounts`);

    // Manually create the deposit instruction using Anchor format
    // Convert the deposit amount to a buffer (little endian 8 bytes)
    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64LE(amount);

    const depositTransaction = new web3.Transaction();
    const depositInstruction = new web3.TransactionInstruction({
      keys: [
        { pubkey: bridgePda, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: bridgeTokenAccount, isSigner: false, isWritable: true },
        { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: Buffer.concat([
        DEPOSIT_DISCRIMINATOR, // Use discriminator for deposit instruction
        amountBuffer, // Amount parameter
      ]),
    });

    depositTransaction.add(depositInstruction);

    // Send and confirm transaction
    console.log("Sending deposit transaction...");
    const depositTx = await web3.sendAndConfirmTransaction(
      connection,
      depositTransaction,
      [keypair]
    );

    console.log("Deposit transaction:", depositTx);
    console.log(`Deposited ${options.amount} tokens to bridge`);

    // Step 2: Burn for cross-chain transfer
    const burnTransaction = new web3.Transaction();

    // Find burn account
    const burnAddress = new web3.PublicKey(
      "burn111111111111111111111111111111111111111"
    );

    const burnTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      burnAddress,
      true // allowOwnerOffCurve
    );

    console.log("Burn token account:", burnTokenAccount.toString());

    // Convert inputs to Buffers
    const fromBuffer = keypair.publicKey.toBuffer();
    const destinationBuffer = Buffer.from(options.destination);
    const destinationLengthBuffer = Buffer.alloc(4);
    destinationLengthBuffer.writeUInt32LE(destinationBuffer.length);

    // Construct the data buffer
    const burnData = Buffer.concat([
      BURN_FOR_BRIDGE_DISCRIMINATOR, // Use discriminator for burn instruction
      fromBuffer, // From parameter
      destinationLengthBuffer, // Length of destination string
      destinationBuffer, // Destination string
      amountBuffer, // Amount parameter
    ]);

    const burnInstruction = new web3.TransactionInstruction({
      keys: [
        { pubkey: bridgePda, isSigner: false, isWritable: true },
        { pubkey: bridgeTokenAccount, isSigner: false, isWritable: true },
        { pubkey: burnTokenAccount, isSigner: false, isWritable: true },
        { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: burnData,
    });

    burnTransaction.add(burnInstruction);

    // Send and confirm transaction
    console.log("Sending burn transaction...");
    const burnTx = await web3.sendAndConfirmTransaction(
      connection,
      burnTransaction,
      [keypair]
    );

    console.log("Burn transaction:", burnTx);
    console.log(
      `Burned ${options.amount} tokens for transfer to Ethereum address ${options.destination}`
    );

    // Fetch and parse the transaction to get the event data
    console.log("\nVerifying event emission...");

    // Wait for 1 second to make sure the transaction is fully processed
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Fetch the transaction details
    const txInfo = await connection.getParsedTransaction(burnTx, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!txInfo || !txInfo.meta) {
      console.error("Error: Could not fetch transaction details");
      process.exit(1);
    }

    // Parse the logs to find the CrossChainTransferEvent
    const logs = txInfo.meta.logMessages || [];

    // Find the program log that contains the event or the instruction
    const burnInstructionLog = logs.find((log) =>
      log.includes("Instruction: BurnForBridge")
    );
    const eventLog = logs.find((log) =>
      log.includes("CrossChainTransferEvent")
    );

    if (burnInstructionLog) {
      console.log("\nBurn instruction executed successfully!");
      console.log(burnInstructionLog);

      // Try to find Program data log which contains the encoded event data
      const dataLog = logs.find((log) => log.includes("Program data:"));
      if (dataLog) {
        console.log("\nFound encoded event data:");
        console.log(dataLog);
        
        // Extract the base64 data from the log
        const base64Data = dataLog.split("Program data:")[1].trim();
        
        try {
          // Decode base64 to buffer
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Skip the first 8 bytes (discriminator)
          let offset = 8;
          
          // Extract 'from' pubkey (32 bytes)
          const fromPubkey = new web3.PublicKey(buffer.slice(offset, offset + 32));
          offset += 32;
          
          // Extract destination string length (4 bytes)
          const destLength = buffer.readUInt32LE(offset);
          offset += 4;
          
          // Extract destination string
          const destination = buffer.slice(offset, offset + destLength).toString('utf8');
          offset += destLength;
          
          // Extract amount (8 bytes)
          const amount = buffer.readBigUInt64LE(offset);
          offset += 8;
          
          // Extract timestamp (8 bytes)
          const timestamp = Number(buffer.readBigInt64LE(offset));
          
          console.log("\nDecoded event data:");
          console.log("From:", fromPubkey.toString());
          console.log("Destination:", destination);
          console.log("Amount:", Number(amount) / 1_000_000); // Convert from raw to UI amount
          console.log("Timestamp:", new Date(timestamp * 1000).toISOString());
          
          // Verify the destination matches what we sent
          if (destination === options.destination) {
            console.log("\nDestination address verified ✓");
          } else {
            console.log("\nWARNING: Destination address mismatch!");
            console.log(`Expected: ${options.destination}`);
            console.log(`Actual: ${destination}`);
          }
          
          // Verify the amount matches what we sent
          const expectedAmount = BigInt(Number(options.amount) * 1_000_000);
          if (amount === expectedAmount) {
            console.log("Amount verified ✓");
          } else {
            console.log("WARNING: Amount mismatch!");
            console.log(`Expected: ${expectedAmount}`);
            console.log(`Actual: ${amount}`);
          }
        } catch (error) {
          console.log("Failed to decode program data:", error);
        }
      }
    } else if (eventLog) {
      console.log("\nCrossChainTransferEvent found in logs:");
      console.log(eventLog);

      // Try to parse the event data
      try {
        const eventDataMatch = eventLog.match(
          /CrossChainTransferEvent\s+{([^}]+)}/
        );
        if (eventDataMatch && eventDataMatch[1]) {
          const eventDataStr = eventDataMatch[1].trim();
          const eventProps = eventDataStr
            .split(",")
            .map((prop) => prop.trim())
            .reduce((acc, prop) => {
              const [key, value] = prop.split(":").map((s) => s.trim());
              acc[key] = value;
              return acc;
            }, {} as Record<string, string>);

          console.log("\nParsed event data:");
          if (eventProps.from) console.log("From:", eventProps.from);
          if (eventProps.destination)
            console.log("Destination:", eventProps.destination);
          if (eventProps.amount) console.log("Amount:", eventProps.amount);
          if (eventProps.timestamp)
            console.log(
              "Timestamp:",
              new Date(parseInt(eventProps.timestamp) * 1000).toISOString()
            );
        }
      } catch (parseError) {
        console.log(
          "Could not parse event data completely, showing raw log only"
        );
      }
    } else {
      console.error(
        "Error: Neither BurnForBridge instruction nor CrossChainTransferEvent found in logs"
      );
      process.exit(1);
    }

    console.log("\nEvent verification successful!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
