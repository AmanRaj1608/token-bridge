export const CONFIG = {
  sepolia: {
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
    tokenAddress: process.env.SEPOLIA_TOKEN_ADDRESS || "",
    privateKey: process.env.SEPOLIA_PRIVATE_KEY || "",
    confirmations: 2,
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    programId: process.env.SOLANA_PROGRAM_ID || "",
    privateKey: process.env.SOLANA_PRIVATE_KEY || "",
  },
  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/token-bridge",
    dbName: "token-bridge",
    collections: {
      transfers: "transfers",
      chainStatus: "chainStatus"
    },
  },
  helius: {
    apiKey: process.env.HELIUS_API_KEY || "",
  },
  polling: {
    interval: parseInt(process.env.POLLING_INTERVAL || "15000", 10), // 15 seconds
  },
  processing: {
    interval: parseInt(process.env.PROCESSING_INTERVAL || "30000", 10), // 30 seconds
    maxRetries: 5
  }
};
