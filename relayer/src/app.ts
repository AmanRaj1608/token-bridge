import express from "express";
import dotenv from "dotenv";
dotenv.config();
import { MongoClient } from "mongodb";
import { CONFIG } from "./config";
import * as sepolia from "./chains/sepolia";
import * as solana from "./chains/solana";
import { Helius } from "helius-sdk";

const app = express();
const port = process.env.PORT || 4000;

// Connect to MongoDB
let db: any;
const mongoClient = new MongoClient(CONFIG.mongodb.uri);

// Initialize Helius with your API key
const helius = new Helius(CONFIG.helius.apiKey);

async function connectToMongo() {
  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB");
    db = mongoClient.db(CONFIG.mongodb.dbName);

    // Create indexes for performance
    await db
      .collection(CONFIG.mongodb.collections.transfers)
      .createIndex({ status: 1 });
    await db
      .collection(CONFIG.mongodb.collections.transfers)
      .createIndex({ sourceChain: 1, status: 1 });
    await db
      .collection(CONFIG.mongodb.collections.transfers)
      .createIndex({ sourceTransactionHash: 1 }, { unique: true });
    await db
      .collection(CONFIG.mongodb.collections.chainStatus)
      .createIndex({ chain: 1 }, { unique: true });
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
}

// Process Ethereum → Solana transfers
async function processEthToSolanaEvents() {
  try {
    // Get the latest processed block from the database
    const chainStatusCollection = db.collection(
      CONFIG.mongodb.collections.chainStatus
    );
    const transfersCollection = db.collection(
      CONFIG.mongodb.collections.transfers
    );

    const lastProcessed = await chainStatusCollection.findOne({
      chain: "ethereum",
    });

    // Get current block number
    const currentBlock = await sepolia.getBlockNumber();

    // Start from the last processed block + 1, or from a reasonable starting point
    const fromBlock = lastProcessed
      ? BigInt(lastProcessed.lastProcessedBlock) + BigInt(1)
      : currentBlock - BigInt(1000);

    // Don't scan more than 1000 blocks at once
    const toBlock = currentBlock - BigInt(CONFIG.sepolia.confirmations);

    if (fromBlock > toBlock) {
      console.log(
        `No new Ethereum blocks to scan. Current block: ${currentBlock}, confirming at: ${toBlock}`
      );
      return;
    }

    console.log(`Scanning Ethereum blocks from ${fromBlock} to ${toBlock}`);

    // Get burn events from Ethereum
    const burnEvents = await sepolia.getLatestBurnEvents(fromBlock, toBlock);

    // Process each event
    for (const event of burnEvents) {
      // Check if we've already processed this event
      const existingTransaction = await transfersCollection.findOne({
        sourceTransactionHash: event.transactionHash,
      });

      if (existingTransaction) {
        console.log(
          `Already processed Ethereum transaction: ${event.transactionHash}`
        );
        continue;
      }

      // Record the pending transfer
      await transfersCollection.insertOne({
        sourceChain: "ethereum",
        destinationChain: "solana",
        sourceTokenAddress: CONFIG.sepolia.tokenAddress,
        destinationTokenAddress: CONFIG.solana.programId,
        amount: event.value.toString(),
        sourceAddress: event.from,
        destinationAddress: event.destinationAddress,
        sourceTransactionHash: event.transactionHash,
        status: "pending",
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(
        `Recorded pending transfer: ${event.value} tokens from Ethereum to Solana for ${event.destinationAddress}`
      );
    }

    // Update the last processed block
    if (burnEvents.length > 0 || fromBlock < toBlock) {
      await chainStatusCollection.updateOne(
        { chain: "ethereum" },
        {
          $set: {
            lastProcessedBlock: toBlock.toString(),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  } catch (error) {
    console.error("Error in processEthToSolanaEvents:", error);
  }
}

// Process Solana → Ethereum transfers
async function processSolanaToEthEvents() {
  try {
    // Get the latest processed signature from the database
    const chainStatusCollection = db.collection(
      CONFIG.mongodb.collections.chainStatus
    );
    const transfersCollection = db.collection(
      CONFIG.mongodb.collections.transfers
    );

    const lastProcessed = await chainStatusCollection.findOne({
      chain: "solana",
    });
    const lastSignature = lastProcessed?.lastProcessedSignature;

    console.log(
      `Scanning Solana transactions since signature: ${
        lastSignature || "beginning"
      }`
    );

    // Get burn events from Solana
    const burnEvents = await solana.getLatestBurnEvents(lastSignature);

    if (burnEvents.length === 0) {
      console.log("No new Solana burn events to process");
      return;
    }

    // Process each event
    for (const event of burnEvents) {
      // Check if we've already processed this event
      const existingTransaction = await transfersCollection.findOne({
        sourceTransactionHash: event.signature,
      });

      if (existingTransaction) {
        console.log(`Already processed Solana transaction: ${event.signature}`);
        continue;
      }

      // Record the pending transfer
      await transfersCollection.insertOne({
        sourceChain: "solana",
        destinationChain: "ethereum",
        sourceTokenAddress: CONFIG.solana.programId,
        destinationTokenAddress: CONFIG.sepolia.tokenAddress,
        amount: event.value.toString(),
        sourceAddress: event.from,
        destinationAddress: event.destinationAddress,
        sourceTransactionHash: event.signature,
        status: "pending",
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(
        `Recorded pending transfer: ${event.value} tokens from Solana to Ethereum for ${event.destinationAddress}`
      );
    }

    // Update the last processed signature if we have events
    if (burnEvents.length > 0) {
      // The first event in the array is the most recent one
      const mostRecentSignature = burnEvents[0].signature;

      await chainStatusCollection.updateOne(
        { chain: "solana" },
        {
          $set: {
            lastProcessedSignature: mostRecentSignature,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  } catch (error) {
    console.error("Error in processSolanaToEthEvents:", error);
  }
}

// Process pending transfers from Ethereum to Solana
async function processEthToSolanaPending() {
  try {
    const transfersCollection = db.collection(
      CONFIG.mongodb.collections.transfers
    );

    // Get pending transfers
    const pendingTransfers = await transfersCollection
      .find({
        sourceChain: "ethereum",
        destinationChain: "solana",
        status: "pending",
        retryCount: { $lt: CONFIG.processing.maxRetries },
      })
      .toArray();

    if (pendingTransfers.length === 0) {
      return;
    }

    console.log(
      `Processing ${pendingTransfers.length} pending Ethereum→Solana transfers`
    );

    for (const transfer of pendingTransfers) {
      try {
        // Update status to processing
        await transfersCollection.updateOne(
          { _id: transfer._id },
          {
            $set: {
              status: "processing",
              updatedAt: new Date(),
            },
          }
        );

        // Mint tokens on Solana
        const mintResult = await solana.mintTokens({
          recipientAddress: transfer.destinationAddress,
          amount: BigInt(transfer.amount),
          sourceChainTxHash: transfer.sourceTransactionHash,
        });

        // Update to completed
        await transfersCollection.updateOne(
          { _id: transfer._id },
          {
            $set: {
              status: "completed",
              destinationTransactionHash: mintResult,
              processedAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );

        console.log(
          `Completed Ethereum→Solana transfer: ${transfer.amount} tokens to ${transfer.destinationAddress}`
        );
      } catch (error) {
        console.error(
          `Error processing Ethereum→Solana transfer ${transfer._id}:`,
          error
        );

        // Update with error and increment retry count
        await transfersCollection.updateOne(
          { _id: transfer._id },
          {
            $set: {
              status: "failed",
              errorMessage:
                error instanceof Error ? error.message : String(error),
              updatedAt: new Date(),
            },
            $inc: { retryCount: 1 },
          }
        );
      }
    }
  } catch (error) {
    console.error("Error in processEthToSolanaPending:", error);
  }
}

// Process pending transfers from Solana to Ethereum
async function processSolanaToEthPending() {
  try {
    const transfersCollection = db.collection(
      CONFIG.mongodb.collections.transfers
    );

    // Get pending transfers
    const pendingTransfers = await transfersCollection
      .find({
        sourceChain: "solana",
        destinationChain: "ethereum",
        status: "pending",
        retryCount: { $lt: CONFIG.processing.maxRetries },
      })
      .toArray();

    if (pendingTransfers.length === 0) {
      return;
    }

    console.log(
      `Processing ${pendingTransfers.length} pending Solana→Ethereum transfers`
    );

    for (const transfer of pendingTransfers) {
      try {
        // Update status to processing
        await transfersCollection.updateOne(
          { _id: transfer._id },
          {
            $set: {
              status: "processing",
              updatedAt: new Date(),
            },
          }
        );

        // Mint tokens on Ethereum
        const mintResult = await sepolia.mintTokens({
          recipientAddress: transfer.destinationAddress,
          amount: BigInt(transfer.amount),
          sourceChainTxHash: transfer.sourceTransactionHash,
        });

        // Update to completed
        await transfersCollection.updateOne(
          { _id: transfer._id },
          {
            $set: {
              status: "completed",
              destinationTransactionHash: mintResult,
              processedAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );

        console.log(
          `Completed Solana→Ethereum transfer: ${transfer.amount} tokens to ${transfer.destinationAddress}`
        );
      } catch (error) {
        console.error(
          `Error processing Solana→Ethereum transfer ${transfer._id}:`,
          error
        );

        // Update with error and increment retry count
        await transfersCollection.updateOne(
          { _id: transfer._id },
          {
            $set: {
              status: "failed",
              errorMessage:
                error instanceof Error ? error.message : String(error),
              updatedAt: new Date(),
            },
            $inc: { retryCount: 1 },
          }
        );
      }
    }
  } catch (error) {
    console.error("Error in processSolanaToEthPending:", error);
  }
}

// Start server and connect to MongoDB
app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  await connectToMongo();

  // Start the bidirectional relayer service
  console.log("Starting bidirectional relayer service...");

  // Event monitoring
  setInterval(processEthToSolanaEvents, CONFIG.polling.interval);
  setInterval(processSolanaToEthEvents, CONFIG.polling.interval);

  // Transfer processing
  setInterval(processEthToSolanaPending, CONFIG.processing.interval);
  setInterval(processSolanaToEthPending, CONFIG.processing.interval);

  // Run immediately on startup
  processEthToSolanaEvents();
  processSolanaToEthEvents();
});

// Add basic health endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Add admin API endpoint to get transfer status
app.get("/api/transfers", async (req, res) => {
  try {
    const { status, sourceChain, limit = 20 } = req.query;
    const query: any = {};

    if (status) query.status = status;
    if (sourceChain) query.sourceChain = sourceChain;

    const transfers = await db
      .collection(CONFIG.mongodb.collections.transfers)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string))
      .toArray();

    res.json(transfers);
  } catch (error) {
    console.error("Error fetching transfers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await mongoClient.close();
  process.exit(0);
});
