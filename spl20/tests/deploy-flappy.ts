import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Spl20 } from "../target/types/spl20";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// Token parameters
const TOKEN_DECIMALS = 6;

// Helper function to calculate token amounts with decimals
function getTokenAmountBN(amount: number): anchor.BN {
  // Convert to string to avoid overflow
  let base = "1";
  for (let i = 0; i < TOKEN_DECIMALS; i++) {
    base += "0";
  }

  // Calculate as strings to avoid BigInt overflow
  const amountStr = amount.toString();
  const result = new anchor.BN(amountStr).mul(new anchor.BN(base));
  return result;
}

const INITIAL_MINT_AMOUNT = getTokenAmountBN(1000); // 1000 tokens with 18 decimals

describe("Flappy Bridge", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Spl20 as Program<Spl20>;
  const admin = provider.wallet;

  // Test parameters
  let tokenMint: PublicKey;
  let adminTokenAccount: PublicKey;
  let bridgePda: PublicKey;
  let bridgeTokenAccount: PublicKey;
  let burnTokenAccount: PublicKey;

  it("Creates a new SPL token", async () => {
    console.log("Admin public key:", admin.publicKey.toString());
    console.log("Creating token mint...");

    const payer = Keypair.fromSecretKey(
      Buffer.from((admin.payer as anchor.web3.Keypair).secretKey)
    );

    tokenMint = await createMint(
      provider.connection,
      payer,
      admin.publicKey,
      admin.publicKey,
      TOKEN_DECIMALS
    );

    console.log("Token mint created:", tokenMint.toString());

    // Create admin's token account
    const adminAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      tokenMint,
      admin.publicKey
    );
    adminTokenAccount = adminAccount.address;

    console.log("Admin token account:", adminTokenAccount.toString());

    // Mint initial supply to admin
    await mintTo(
      provider.connection,
      payer,
      tokenMint,
      adminTokenAccount,
      admin.publicKey,
      BigInt(INITIAL_MINT_AMOUNT.toString(10))
    );

    console.log(`Minted ${INITIAL_MINT_AMOUNT.toString(10)} tokens to admin`);

    // Verify token account
    const adminTokenInfo = await getAccount(
      provider.connection,
      adminTokenAccount
    );

    console.log("Admin token balance:", adminTokenInfo.amount.toString());
  });

  it("Initializes the bridge", async () => {
    console.log("Initializing bridge...");

    // Find the bridge PDA
    [bridgePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("flappy_bridge")],
      program.programId
    );

    console.log("Bridge PDA:", bridgePda.toString());

    try {
      // Initialize the bridge
      await program.methods
        .initializeBridge(tokenMint)
        .accounts({
          bridge: bridgePda,
          authority: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Bridge initialized successfully");

      // Create a token account for the bridge
      const payer = Keypair.fromSecretKey(
        Buffer.from((admin.payer as anchor.web3.Keypair).secretKey)
      );

      const bridgeAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        tokenMint,
        bridgePda,
        true
      );
      bridgeTokenAccount = bridgeAccount.address;

      console.log("Bridge token account:", bridgeTokenAccount.toString());

      // Create a burn token account
      const burnAddress = new PublicKey(
        "burn111111111111111111111111111111111111111"
      );
      const burnAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        tokenMint,
        burnAddress,
        true
      );
      burnTokenAccount = burnAccount.address;

      console.log("Burn token account:", burnTokenAccount.toString());

      // Fetch the bridge account data
      const bridgeData = await program.account.flappyBridge.fetch(bridgePda);
      console.log("Bridge authority:", bridgeData.authority.toString());
      console.log("Bridge token mint:", bridgeData.tokenMint.toString());
    } catch (error) {
      console.error("Failed to initialize bridge:", error);
      throw error;
    }
  });

  it("Deposits tokens to the bridge", async () => {
    console.log("Depositing tokens to bridge...");

    const depositAmount = getTokenAmountBN(100); // 100 tokens

    // First, check balance before deposit
    const adminTokenInfoBefore = await getAccount(
      provider.connection,
      adminTokenAccount
    );
    console.log(
      "Admin token balance before deposit:",
      adminTokenInfoBefore.amount.toString()
    );

    // Deposit tokens to bridge
    try {
      await program.methods
        .deposit(depositAmount)
        .accounts({
          bridge: bridgePda,
          userTokenAccount: adminTokenAccount,
          bridgeTokenAccount: bridgeTokenAccount,
          owner: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("Deposit successful");

      // Check balances after deposit
      const adminTokenInfoAfter = await getAccount(
        provider.connection,
        adminTokenAccount
      );
      const bridgeTokenInfo = await getAccount(
        provider.connection,
        bridgeTokenAccount
      );

      console.log(
        "Admin token balance after deposit:",
        adminTokenInfoAfter.amount.toString()
      );
      console.log(
        "Bridge token balance after deposit:",
        bridgeTokenInfo.amount.toString()
      );
    } catch (error) {
      console.error("Failed to deposit tokens:", error);
      throw error;
    }
  });

  it("Burns tokens for cross-chain transfer", async () => {
    console.log("Burning tokens for cross-chain transfer...");

    const burnAmount = getTokenAmountBN(50); // 50 tokens
    const destinationAddress = "0x1234567890123456789012345678901234567890"; // Ethereum address

    try {
      await program.methods
        .burnForBridge(admin.publicKey, destinationAddress, burnAmount)
        .accounts({
          bridge: bridgePda,
          bridgeTokenAccount: bridgeTokenAccount,
          burnAccount: burnTokenAccount,
          authority: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("Burn successful");

      // Check balances after burn
      const bridgeTokenInfo = await getAccount(
        provider.connection,
        bridgeTokenAccount
      );
      const burnTokenInfo = await getAccount(
        provider.connection,
        burnTokenAccount
      );

      console.log(
        "Bridge token balance after burn:",
        bridgeTokenInfo.amount.toString()
      );
      console.log(
        "Burn token balance after burn:",
        burnTokenInfo.amount.toString()
      );
    } catch (error) {
      console.error("Failed to burn tokens:", error);
      throw error;
    }
  });
});
