import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Spl20 } from "../target/types/spl20";
import { expect } from "chai";
import { Keypair } from "@solana/web3.js";

describe("SPL20 Token Tests", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Spl20 as Program<Spl20>;

  // Test accounts
  const admin = provider.wallet;
  const user1 = anchor.web3.Keypair.generate();
  const user2 = anchor.web3.Keypair.generate();

  // Token parameters
  const tokenName = "Test Token";
  const tokenSymbol = "TEST";
  const tokenDecimals = 9;
  const mintAmount = new anchor.BN(1000_000_000_000); // 1000 tokens with 9 decimals
  const transferAmount = new anchor.BN(250_000_000_000); // 250 tokens with 9 decimals
  const burnAmount = new anchor.BN(100_000_000_000); // 100 tokens with 9 decimals

  // Account addresses
  let tokenMint: Keypair;
  let user1TokenAccount: Keypair;
  let user2TokenAccount: Keypair;

  before(async () => {
    // Airdrop SOL to test users for transaction fees
    const signature1 = await provider.connection.requestAirdrop(
      user1.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature1);

    const signature2 = await provider.connection.requestAirdrop(
      user2.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature2);
  });

  it("Initializes a new token mint", async () => {
    // Create a new token mint
    tokenMint = anchor.web3.Keypair.generate();

    await program.methods
      .initialize(tokenName, tokenSymbol, tokenDecimals)
      .accounts({
        tokenMint: tokenMint.publicKey,
        authority: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([tokenMint])
      .rpc();

    // Fetch the mint account and verify its data
    const mintAccount = await program.account.tokenMint.fetch(
      tokenMint.publicKey
    );

    expect(mintAccount.name).to.equal(tokenName);
    expect(mintAccount.symbol).to.equal(tokenSymbol);
    expect(mintAccount.decimals).to.equal(tokenDecimals);
    expect(mintAccount.authority.toString()).to.equal(
      admin.publicKey.toString()
    );
    expect(mintAccount.totalSupply.toString()).to.equal("0");
  });

  it("Creates a token account for user1", async () => {
    // Create a token account for user1
    user1TokenAccount = anchor.web3.Keypair.generate();
    
    await program.methods
      .createAccount()
      .accounts({
        tokenMint: tokenMint.publicKey,
        tokenAccount: user1TokenAccount.publicKey,
        owner: user1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user1TokenAccount, user1])
      .rpc();
    
    // Fetch the token account and verify its data
    const tokenAccount = await program.account.tokenAccount.fetch(user1TokenAccount.publicKey);
    
    expect(tokenAccount.owner.toString()).to.equal(user1.publicKey.toString());
    expect(tokenAccount.mint.toString()).to.equal(tokenMint.publicKey.toString());
    expect(tokenAccount.amount.toString()).to.equal("0");
  });

  it("Creates a token account for user2", async () => {
    // Create a token account for user2
    user2TokenAccount = anchor.web3.Keypair.generate();
    
    await program.methods
      .createAccount()
      .accounts({
        tokenMint: tokenMint.publicKey,
        tokenAccount: user2TokenAccount.publicKey,
        owner: user2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user2TokenAccount, user2])
      .rpc();
    
    // Fetch the token account and verify its data
    const tokenAccount = await program.account.tokenAccount.fetch(user2TokenAccount.publicKey);
    
    expect(tokenAccount.owner.toString()).to.equal(user2.publicKey.toString());
    expect(tokenAccount.mint.toString()).to.equal(tokenMint.publicKey.toString());
    expect(tokenAccount.amount.toString()).to.equal("0");
  });

  it("Mints tokens to user1", async () => {
    // Mint tokens to user1
    await program.methods
      .mint(mintAmount)
      .accounts({
        tokenMint: tokenMint.publicKey,
        tokenAccount: user1TokenAccount.publicKey,
        authority: admin.publicKey,
      })
      .rpc();

    // Fetch the token account and verify its balance
    const tokenAccount = await program.account.tokenAccount.fetch(user1TokenAccount.publicKey);
    const mintAccount = await program.account.tokenMint.fetch(tokenMint.publicKey);

    expect(tokenAccount.amount.toString()).to.equal(mintAmount.toString());
    expect(mintAccount.totalSupply.toString()).to.equal(mintAmount.toString());
  });

  it("Transfers tokens from user1 to user2", async () => {
    // Transfer tokens from user1 to user2
    await program.methods
      .transfer(transferAmount)
      .accounts({
        from: user1TokenAccount.publicKey,
        to: user2TokenAccount.publicKey,
        owner: user1.publicKey,
      })
      .signers([user1])
      .rpc();

    // Fetch the token accounts and verify their balances
    const fromAccount = await program.account.tokenAccount.fetch(user1TokenAccount.publicKey);
    const toAccount = await program.account.tokenAccount.fetch(user2TokenAccount.publicKey);

    expect(fromAccount.amount.toString()).to.equal(
      mintAmount.sub(transferAmount).toString()
    );
    expect(toAccount.amount.toString()).to.equal(transferAmount.toString());
  });

  it("Burns tokens from user2", async () => {
    // Burn tokens from user2
    await program.methods
      .burn(burnAmount)
      .accounts({
        tokenMint: tokenMint.publicKey,
        tokenAccount: user2TokenAccount.publicKey,
        owner: user2.publicKey,
      })
      .signers([user2])
      .rpc();

    // Fetch the token account and verify its balance
    const tokenAccount = await program.account.tokenAccount.fetch(user2TokenAccount.publicKey);
    const mintAccount = await program.account.tokenMint.fetch(tokenMint.publicKey);

    expect(tokenAccount.amount.toString()).to.equal(
      transferAmount.sub(burnAmount).toString()
    );
    expect(mintAccount.totalSupply.toString()).to.equal(
      mintAmount.sub(burnAmount).toString()
    );
  });

  it("Fails when non-admin tries to mint", async () => {
    // Try to mint with a non-admin account
    try {
      await program.methods
        .mint(mintAmount)
        .accounts({
          tokenMint: tokenMint.publicKey,
          tokenAccount: user1TokenAccount.publicKey,
          authority: user1.publicKey,
        })
        .signers([user1])
        .rpc();

      // If execution reaches here, the test has failed because the transaction did not throw an error
      expect.fail("Minting should have failed with a non-admin account");
    } catch (error) {
      // Expect an unauthorized error
      expect(error.message).to.include("UnauthorizedMintAuthority");
    }
  });

  it("Fails when trying to burn more tokens than available", async () => {
    const excessBurnAmount = new anchor.BN(1000_000_000_000); // More than user2 has

    // Try to burn more tokens than available
    try {
      await program.methods
        .burn(excessBurnAmount)
        .accounts({
          tokenMint: tokenMint.publicKey,
          tokenAccount: user2TokenAccount.publicKey,
          owner: user2.publicKey,
        })
        .signers([user2])
        .rpc();

      // If execution reaches here, the test has failed because the transaction did not throw an error
      expect.fail("Burning should have failed with insufficient funds");
    } catch (error) {
      // Expect an insufficient funds error
      expect(error.message).to.include("InsufficientFunds");
    }
  });
});
