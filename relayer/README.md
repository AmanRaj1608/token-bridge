# Token Bridge Relayer

This relayer service facilitates cross-chain token transfers between Solana (SVM) and Ethereum (EVM) networks.

```sh
                  ┌────────────────┐                  ┌────────────────┐
                  │   Ethereum     │                  │    Solana      │
                  │   Network      │                  │    Network     │
                  └───────┬────────┘                  └────────┬───────┘
                          │                                    │
                          ▼                                    ▼
┌─────────────────────────────────────────┐    ┌─────────────────────────────────────────┐
│           Event Listeners               │    │           Event Listeners               │
│  ┌─────────────────┐  ┌─────────────────┐   │  ┌─────────────────┐  ┌─────────────────┐   │
│  │   ETH Burn      │  │   SOL Mint      │   │  │   SOL Burn      │  │   ETH Mint      │   │
│  │   Listener      │  │   Confirmer     │   │  │   Listener      │  │   Confirmer     │   │
│  └────────┬────────┘  └────────┬────────┘   │  └────────┬────────┘  └────────┬────────┘   │
└───────────┼─────────────────────┼───────────┘          │                     │
            │                     │                       │                     │
            ▼                     ▼                       ▼                     ▼
     ┌─────────────────────────────────────────────────────────────────────────────────┐
     │                                  MongoDB                                        │
     │  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐               │
     │  │ Pending         │   │ Processing      │   │ Completed       │               │
     │  │ Transfers       │   │ Transfers       │   │ Transfers       │               │
     │  └─────────────────┘   └─────────────────┘   └─────────────────┘               │
     └────────────────────────────────┬────────────────────────────────────────────────┘
                                      │
                                      ▼
                       ┌─────────────────────────────────┐
                       │     Processing Pipeline         │
                       │  ┌─────────────────────────┐   │
                       │  │ ETH → SOL Processor     │   │
                       │  └─────────────────────────┘   │
                       │  ┌─────────────────────────┐   │
                       │  │ SOL → ETH Processor     │   │
                       │  └─────────────────────────┘   │
                       └─────────────────────────────────┘
```

### Features

- Monitors burn events on Ethereum (Sepolia) token contract
- Processes these events and mints equivalent tokens on Solana
- Stores transfer records in MongoDB for tracking and preventing duplicate processing
- Automatically retries failed transactions
- Provides health endpoint and graceful shutdown

Use:
```sh
yarn build
yarn start
```
