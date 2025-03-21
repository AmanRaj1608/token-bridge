# Token Bridge Relayer

This service monitors a token contract on Ethereum Sepolia for burn events and mints equivalent tokens on Solana.

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

For production, use:

```sh
yarn build
yarn start
```
