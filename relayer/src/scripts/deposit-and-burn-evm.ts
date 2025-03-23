import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  keccak256,
  toHex,
  encodeEventTopics,
  decodeEventLog,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { program } from "commander";
import dotenv from "dotenv";
import { getErc20Abi } from "../utils";
import { CONFIG } from "../config";

dotenv.config();

program
  .option("-a, --amount <number>", "Amount of tokens to transfer")
  .option("-d, --destination <address>", "Destination Solana address")
  .parse(process.argv);

const options = program.opts();

async function main() {
  if (!options.amount || !options.destination) {
    console.error("Error: Both amount and destination are required");
    process.exit(1);
  }

  // Validate Solana address format (base58 encoded, usually 32-44 characters)
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(options.destination)) {
    console.error(
      "Error: Invalid Solana address format. Must be base58 encoded."
    );
    process.exit(1);
  }

  // Load configuration
  const rpcUrl = process.env.SEPOLIA_RPC_URL || "";
  const bridgeAddress = CONFIG.flappy.evmBridgeAddress;
  const tokenAddress = CONFIG.flappy.evmTokenAddress;

  // Ensure private key has 0x prefix
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY?.startsWith("0x")
    ? process.env.SEPOLIA_PRIVATE_KEY
    : `0x${process.env.SEPOLIA_PRIVATE_KEY}`;

  if (!rpcUrl || !bridgeAddress || !privateKey) {
    console.error("Error: Missing required environment variables");
    process.exit(1);
  }

  // Set up clients
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    chain: sepolia,
    transport: http(rpcUrl),
    account,
  });

  // Get contract ABIs
  const erc20Abi = getErc20Abi();
  const bridgeAbi = parseAbi([
    "function deposit(uint256 amount) external",
    "function burnForBridge(address from, string calldata destinationAddress, uint256 amount) external",
    "function owner() view returns (address)",
    "function flappyToken() view returns (address)",
  ]);

  try {
    console.log("Using account:", account.address);
    console.log("Bridge contract:", bridgeAddress);
    console.log("Token address:", tokenAddress);

    // Check if the account is the bridge owner
    const ownerAddress = await publicClient.readContract({
      address: bridgeAddress as `0x${string}`,
      abi: bridgeAbi,
      functionName: "owner",
    });

    console.log("Bridge owner:", ownerAddress);
    const isOwner =
      account.address.toLowerCase() === (ownerAddress as string).toLowerCase();
    console.log("Is bridge owner:", isOwner);

    // Check token balance
    const balance = (await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint;

    const decimals = (await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "decimals",
    })) as number;

    const amountWithDecimals =
      BigInt(options.amount) * BigInt(10 ** Number(decimals));
    const readableBalance = Number(balance) / 10 ** Number(decimals);

    console.log(`Token balance: ${readableBalance} FLP`);
    console.log(`Required amount: ${options.amount} FLP`);

    if (balance < amountWithDecimals) {
      console.error(
        `Error: Insufficient token balance. You need at least ${options.amount} FLP`
      );
      process.exit(1);
    }

    // Step 1: Approve the bridge to spend tokens
    console.log(
      `Approving ${options.amount} tokens to be spent by the bridge...`
    );
    const approveTx = await walletClient.writeContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "approve",
      args: [bridgeAddress as `0x${string}`, amountWithDecimals],
    });

    console.log("Approval transaction:", approveTx);

    // Wait for approval confirmation
    const approveReceipt = await publicClient.waitForTransactionReceipt({
      hash: approveTx,
    });

    console.log("Approval confirmed in block:", approveReceipt.blockNumber);

    // Step 2: Deposit tokens to the bridge
    console.log(`Depositing ${options.amount} tokens to bridge...`);
    const depositTx = await walletClient.writeContract({
      address: bridgeAddress as `0x${string}`,
      abi: bridgeAbi,
      functionName: "deposit",
      args: [amountWithDecimals],
    });

    console.log("Deposit transaction:", depositTx);

    // Wait for deposit confirmation
    const depositReceipt = await publicClient.waitForTransactionReceipt({
      hash: depositTx,
    });

    console.log("Deposit confirmed in block:", depositReceipt.blockNumber);

    // Step 3: Burn for cross-chain transfer
    // Only owner can call burnForBridge
    if (!isOwner) {
      console.error(
        "Error: Your account is not the bridge owner, cannot execute burnForBridge"
      );
      console.log("Please have the bridge owner execute this step");
      process.exit(1);
    }

    console.log(
      `Burning ${options.amount} tokens for transfer to Solana address ${options.destination}...`
    );
    const burnTx = await walletClient.writeContract({
      address: bridgeAddress as `0x${string}`,
      abi: bridgeAbi,
      functionName: "burnForBridge",
      args: [account.address, options.destination, amountWithDecimals],
    });

    console.log("Burn transaction:", burnTx);

    // Wait for burn confirmation
    const burnReceipt = await publicClient.waitForTransactionReceipt({
      hash: burnTx,
    });

    console.log("Burn confirmed in block:", burnReceipt.blockNumber);
    console.log(
      `Successfully burned ${options.amount} tokens for transfer to Solana address ${options.destination}`
    );

    // Check for BridgeInitiated event
    console.log("\nVerifying event emission...");

    // Define the bridge ABI for the event
    const bridgeEventAbi = parseAbi([
      "event BridgeInitiated(address indexed from, string destinationAddress, uint256 amount, uint256 timestamp)",
    ]);

    // Find BridgeInitiated events in the logs
    try {
      // Find and decode logs
      const logs = burnReceipt.logs.filter(
        (log) => log.address.toLowerCase() === bridgeAddress.toLowerCase()
      );

      let eventFound = false;
      let decodedEvent: any = null;

      for (const log of logs) {
        try {
          const decoded = decodeEventLog({
            abi: bridgeEventAbi,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "BridgeInitiated") {
            eventFound = true;
            decodedEvent = decoded;
            break;
          }
        } catch (e) {
          // Skip logs that don't match our event signature
          continue;
        }
      }

      if (!eventFound || !decodedEvent) {
        console.error(
          "Error: BridgeInitiated event not found in transaction logs"
        );
        process.exit(1);
      }

      console.log("\nBridgeInitiated event details:");
      console.log("From address:", decodedEvent.args.from);
      console.log("Destination:", decodedEvent.args.destinationAddress);
      console.log("Amount:", decodedEvent.args.amount.toString());
      console.log(
        "Timestamp:",
        new Date(Number(decodedEvent.args.timestamp) * 1000).toISOString()
      );
      console.log("\nEvent verification successful!");
    } catch (eventError) {
      console.error("Error parsing event:", eventError);
      process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
