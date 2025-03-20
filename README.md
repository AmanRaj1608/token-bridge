# Token Bridge Implementation

### Objective

Design and implement a simplified token bridge system between Solana (SVM) and Ethereum (EVM).

### Background

Token bridges are fundamental infrastructure in blockchain interoperability. This assignment tests understanding of both virtual machines' execution models, their differences, and the implementation of functioning token transfers between chains.

### Task Description

1. Create a basic SPL token on Solana with mint/burn capabilities and standard interfaces
2. Develop an ERC20 token on Ethereum with equivalent functionality
3. Implement a simple relayer service that:
   - Listens for burn events on the source chain
   - Uses permissioned minting (only the relayer should have permission to mint tokens)
4. Write tests covering the core functionality and security features

### Deliverables

- Provide a GitHub repository containing:
  - Solana and Ethereum smart contracts
  - Tests for both implementations, in particular multi-VM interactions
  - Clear documentation on setup and deployment
  - Example scripts for executing cross-chain transfers

### Evaluation Criteria

1. **Code Quality:** Clean and well-documented implementation
2. **Functionality:** Correct implementation of token standards(ERC20, SPL) and mint/burn mechanics
3. **Security:** Proper handling of access controls and signature verification
4. **Testing:** Integration tests of core functionality
