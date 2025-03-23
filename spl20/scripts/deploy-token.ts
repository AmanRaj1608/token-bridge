import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Token parameters
const TOKEN_DECIMALS = 6;

// Helper function to calculate token amounts
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

const INITIAL_MINT_AMOUNT = getTokenAmountBN(1000); // 1000 tokens with 6 decimals

async function main() {
  console.log("Starting token deployment and bridge initialization...");

  try {
    // Configure the client to use the cluster from env
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    

    // Get the program from workspace using the IDL
    const idl = JSON.parse(fs.readFileSync("./target/idl/spl20.json", "utf8"));
    const programId = new PublicKey(idl.metadata.address);
    const program = new anchor.Program(idl, provider);

    console.log("Program ID:", programId.toString());
    console.log("Admin public key:", provider.wallet.publicKey.toString());

    // 1. Deploy the SPL Token
    console.log("Creating Flappy token...");
    const payer = Keypair.fromSecretKey(
      Buffer.from((provider.wallet.payer as anchor.web3.Keypair).secretKey)
    );

    const tokenMint = await createMint(
      provider.connection,
      payer,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      TOKEN_DECIMALS
    );

    console.log("Flappy token mint created:", tokenMint.toString());

    // Create admin's token account
    const adminTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      tokenMint,
      provider.wallet.publicKey
    );

    console.log("Admin token account:", adminTokenAccount.address.toString());

    // Convert the BN to a string for the mintTo function
    const amountStr = INITIAL_MINT_AMOUNT.toString(10);

    // Mint initial supply to admin
    await mintTo(
      provider.connection,
      payer,
      tokenMint,
      adminTokenAccount.address,
      provider.wallet.publicKey,
      BigInt(amountStr) // Convert to BigInt for compatibility
    );

    console.log(`Minted ${amountStr} tokens to admin`);

    // 2. Initialize the bridge (already deployed via anchor deploy)
    console.log("Initializing bridge with token mint...");

    // Get the bridge PDA
    const [bridgePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("flappy_bridge")],
      programId
    );

    console.log("Bridge PDA:", bridgePda.toString());

    // Initialize the bridge with our new token mint
    const tx = await program.methods
      .initializeBridge(tokenMint)
      .accounts({
        bridge: bridgePda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Bridge initialized. Transaction signature:", tx);

    // Create accounts for bridge operations
    const bridgeTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      tokenMint,
      bridgePda,
      true
    );

    console.log("Bridge token account:", bridgeTokenAccount.address.toString());

    const burnAddress = new PublicKey(
      "burn111111111111111111111111111111111111111"
    );
    const burnTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      tokenMint,
      burnAddress,
      true
    );

    console.log("Burn token account:", burnTokenAccount.address.toString());

    // Save addresses to a file
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const addresses = {
      programId: programId.toString(),
      tokenMint: tokenMint.toString(),
      adminTokenAccount: adminTokenAccount.address.toString(),
      bridgePda: bridgePda.toString(),
      bridgeTokenAccount: bridgeTokenAccount.address.toString(),
      burnTokenAccount: burnTokenAccount.address.toString(),
    };

    fs.writeFileSync(
      path.join(deploymentDir, "addresses.json"),
      JSON.stringify(addresses, null, 2)
    );

    console.log(
      "Deployment complete. Addresses saved to deployments/addresses.json"
    );
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
