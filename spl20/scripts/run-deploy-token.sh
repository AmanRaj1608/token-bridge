#!/bin/bash

# Set Solana environment variables to use devnet
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"

# Configure Solana CLI to use devnet
solana config set --url devnet

# Check wallet balance
echo "Checking wallet balance on devnet..."
solana balance

echo "Building Anchor program..."
anchor build

echo "Deploying Anchor program to devnet..."
anchor deploy

echo "Deploying token and initializing bridge on devnet..."
node scripts/deploy-token.js

echo "Deployment complete!" 