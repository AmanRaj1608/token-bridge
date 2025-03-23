import express from "express";
import dotenv from "dotenv";
dotenv.config();
import { MongoClient } from "mongodb";
import { CONFIG } from "./config";
import * as sepolia from "./chains/sepolia";
import * as solana from "./chains/solana";

const app = express();
const port = process.env.PORT || 4000;

let db: any;
const mongoClient = new MongoClient(CONFIG.mongodb.uri);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 5,
  initialDelay = 500
): Promise<T> {
  let retries = 0;
  let currentDelay = initialDelay;

  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      const isRateLimit =
        error.message?.includes("429") ||
        error.message?.includes("Too Many Requests") ||
        error.message?.includes("rate limit");

      if (!isRateLimit || retries >= maxRetries) {
        throw error;
      }

      retries++;
      console.log(
        `Rate limit hit. Retrying in ${currentDelay}ms (${retries}/${maxRetries})...`
      );
      await delay(currentDelay);
      currentDelay *= 2;
    }
  }
}

async function connectToMongo() {
  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB");
    db = mongoClient.db(CONFIG.mongodb.dbName);

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
    const chainStatusCollection = db.collection(
      CONFIG.mongodb.collections.chainStatus
    );
    const transfersCollection = db.collection(
      CONFIG.mongodb.collections.transfers
    );

    const lastProcessed = await chainStatusCollection.findOne({
      chain: "ethereum",
    });

    const currentBlock = await withRateLimitRetry(() =>
      sepolia.getBlockNumber()
    );
    const fromBlock = lastProcessed
      ? BigInt(lastProcessed.lastProcessedBlock) + BigInt(1)
      : currentBlock - BigInt(1000);
    const toBlock = currentBlock - BigInt(CONFIG.sepolia.confirmations);

    if (fromBlock > toBlock) {
      console.log(
        `No new Ethereum blocks to scan. Current block: ${currentBlock}, confirming at: ${toBlock}`
      );
      return;
    }

    console.log(`Scanning Ethereum blocks from ${fromBlock} to ${toBlock}`);

    const burnEvents = await withRateLimitRetry(() =>
      sepolia.getLatestBurnEvents(fromBlock, toBlock)
    );

    for (const event of burnEvents) {
      const existingTransaction = await transfersCollection.findOne({
        sourceTransactionHash: event.transactionHash,
      });

      if (existingTransaction) {
        console.log(
          `Already processed Ethereum transaction: ${event.transactionHash}`
        );
        continue;
      }

      console.log(`Found new Ethereum burn event: ${event.transactionHash}`);
      console.log(`  From: ${event.from}`);
      console.log(`  To: ${event.destinationAddress}`);
      console.log(`  Amount: ${event.value}`);

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

      console.log(`Updated last processed Ethereum block to ${toBlock}`);
    }
  } catch (error) {
    console.error("Error in processEthToSolanaEvents:", error);
  }
}

// Process Solana → Ethereum transfers
async function processSolanaToEthEvents() {
  try {
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

    const burnEvents = await withRateLimitRetry(() =>
      solana.getLatestBurnEvents(lastSignature)
    );

    if (burnEvents.length === 0) {
      console.log("No new Solana burn events to process");
      return;
    }

    console.log(`Found ${burnEvents.length} new Solana burn events`);

    for (const event of burnEvents) {
      if (event.from === "error" || event.destinationAddress === "error") {
        console.log(`Skipping invalid event: ${event.signature}`);
        continue;
      }

      const existingTransaction = await transfersCollection.findOne({
        sourceTransactionHash: event.signature,
      });

      if (existingTransaction) {
        console.log(`Already processed Solana transaction: ${event.signature}`);
        continue;
      }

      console.log(`Found new Solana burn event: ${event.signature}`);
      console.log(`  From: ${event.from}`);
      console.log(`  To: ${event.destinationAddress}`);
      console.log(`  Amount: ${event.value}`);

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

    if (burnEvents.length > 0) {
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

      console.log(
        `Updated last processed Solana signature to ${mostRecentSignature}`
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
        console.log(
          `Processing transfer ${transfer._id} (${transfer.sourceTransactionHash})`
        );
        await transfersCollection.updateOne(
          { _id: transfer._id },
          {
            $set: {
              status: "processing",
              updatedAt: new Date(),
            },
          }
        );

        const mintResult = await withRateLimitRetry(() =>
          solana.mintTokens({
            recipientAddress: transfer.destinationAddress,
            amount: BigInt(transfer.amount),
            sourceChainTxHash: transfer.sourceTransactionHash,
          })
        );

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
          `Completed Ethereum→Solana transfer: ${transfer.amount} tokens to ${transfer.destinationAddress} (tx: ${mintResult})`
        );
      } catch (error) {
        console.error(
          `Error processing Ethereum→Solana transfer ${transfer._id}:`,
          error
        );

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
        console.log(
          `Processing transfer ${transfer._id} (${transfer.sourceTransactionHash})`
        );
        await transfersCollection.updateOne(
          { _id: transfer._id },
          {
            $set: {
              status: "processing",
              updatedAt: new Date(),
            },
          }
        );

        const mintResult = await withRateLimitRetry(() =>
          sepolia.mintTokens({
            recipientAddress: transfer.destinationAddress,
            amount: BigInt(transfer.amount),
            sourceChainTxHash: transfer.sourceTransactionHash,
          })
        );

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
          `Completed Solana→Ethereum transfer: ${transfer.amount} tokens to ${transfer.destinationAddress} (tx: ${mintResult})`
        );
      } catch (error) {
        console.error(
          `Error processing Solana→Ethereum transfer ${transfer._id}:`,
          error
        );

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

app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  await connectToMongo();

  console.log("Starting bidirectional relayer service...");

  setInterval(processEthToSolanaEvents, CONFIG.polling.interval);
  setInterval(processSolanaToEthEvents, CONFIG.polling.interval);
  setInterval(processEthToSolanaPending, CONFIG.processing.interval);
  setInterval(processSolanaToEthPending, CONFIG.processing.interval);

  processEthToSolanaEvents();
  processSolanaToEthEvents();
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

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

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await mongoClient.close();
  process.exit(0);
});
