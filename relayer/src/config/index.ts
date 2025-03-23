const flappy = {
  evmTokenAddress: "0xE6a10059f1206aCf2925Bbcc7dECD54AbD6DeFd1",
  evmBridgeAddress: "0x56AD7aeD091C804D845F4F1a397E8dED41e61eb4",
  solanaTokenAddress: "4QLR9Eu76BqdqqgLgK57ZNrTmUd9Fd8QYcqRFWWducUH",
  solanaBridgeAddress: "8X3gPhhqv562jvPgK7Yj7VWwSjYjcsxUuedJKcic8Pwf",
};

export const CONFIG = {
  flappy,
  sepolia: {
    rpcUrl:
      process.env.SEPOLIA_RPC_URL ||
      "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
    tokenAddress: flappy.evmTokenAddress,
    privateKey: process.env.SEPOLIA_PRIVATE_KEY || "",
    confirmations: 2,
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    programId: flappy.solanaBridgeAddress,
    privateKey: process.env.SOLANA_PRIVATE_KEY || "",
  },
  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/token-bridge",
    dbName: "token-bridge",
    collections: {
      transfers: "transfers",
      chainStatus: "chainStatus",
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
    maxRetries: 5,
  },
};
