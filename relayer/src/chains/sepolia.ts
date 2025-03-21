import { createPublicClient, http, parseAbi, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { CONFIG } from "../config";
import { getErc20Abi } from "../utils";

// Connect to the EVM chain
export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(CONFIG.sepolia.rpcUrl),
});

// Setup wallet with private key - ensure it has 0x prefix
const privateKey = CONFIG.sepolia.privateKey.startsWith("0x")
  ? CONFIG.sepolia.privateKey
  : `0x${CONFIG.sepolia.privateKey}`;

const account = privateKeyToAccount(privateKey as `0x${string}`);
export const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(CONFIG.sepolia.rpcUrl),
  account,
});

const burnEventSignature =
  "event Burn(address indexed from, uint256 value, string destinationAddress)";
const abi = [...getErc20Abi(), parseAbi([burnEventSignature])];

export interface BurnEvent {
  from: string;
  value: bigint;
  destinationAddress: string;
  blockNumber: bigint;
  transactionHash: string;
}

export async function getLatestBurnEvents(
  fromBlock: bigint,
  toBlock: bigint
): Promise<BurnEvent[]> {
  try {
    const burnEvents = await publicClient.getLogs({
      address: CONFIG.sepolia.tokenAddress as `0x${string}`,
      event: parseAbi([burnEventSignature])[0],
      fromBlock,
      toBlock,
    });

    return burnEvents.map((event) => {
      const args = event.args as unknown as {
        from: string;
        value: bigint;
        destinationAddress: string;
      };

      return {
        from: args.from,
        value: args.value,
        destinationAddress: args.destinationAddress,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      };
    });
  } catch (error) {
    console.error("Error fetching burn events:", error);
    return [];
  }
}

export async function getBlockNumber(): Promise<bigint> {
  return publicClient.getBlockNumber();
}

// Add functionality for minting tokens on Ethereum
export async function mintTokens(params: {
  recipientAddress: string;
  amount: bigint;
  sourceChainTxHash: string;
}): Promise<string> {
  try {
    // Call mint function on Ethereum
    const tokenContract = CONFIG.sepolia.tokenAddress as `0x${string}`;
    const data = await walletClient.writeContract({
      address: tokenContract,
      abi: getErc20Abi(),
      functionName: 'mint', // Adjust based on your contract
      args: [
        params.recipientAddress as `0x${string}`, 
        params.amount
      ]
    });
    
    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: data,
      confirmations: CONFIG.sepolia.confirmations
    });
    
    console.log(`Minted ${params.amount} tokens on Ethereum to ${params.recipientAddress}, tx: ${receipt.transactionHash}`);
    return receipt.transactionHash;
  } catch (error) {
    console.error('Error minting tokens on Ethereum:', error);
    throw error;
  }
}
