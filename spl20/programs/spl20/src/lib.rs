use anchor_lang::prelude::*;

declare_id!("41Kus9DQ9gaxTjMVsjUvoh2z9v2EY3fYdo7zWwW5Rssg");

#[program]
pub mod spl20 {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, name: String, symbol: String, decimals: u8) -> Result<()> {
        let token_mint = &mut ctx.accounts.token_mint;
        let authority = &ctx.accounts.authority;

        token_mint.name = name;
        token_mint.symbol = symbol;
        token_mint.decimals = decimals;
        token_mint.authority = authority.key();
        token_mint.total_supply = 0;

        msg!("SPL20 Token initialized: {}", token_mint.symbol);
        Ok(())
    }

    pub fn create_account(ctx: Context<CreateAccount>) -> Result<()> {
        let token_account = &mut ctx.accounts.token_account;
        let owner = &ctx.accounts.owner;
        let token_mint = &ctx.accounts.token_mint;

        token_account.owner = owner.key();
        token_account.mint = token_mint.key();
        token_account.amount = 0;

        msg!("Token account created for {}", owner.key());
        Ok(())
    }

    pub fn mint(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        let token_mint = &mut ctx.accounts.token_mint;
        let token_account = &mut ctx.accounts.token_account;
        let authority = &ctx.accounts.authority;

        require!(
            token_mint.authority == authority.key(),
            TokenError::UnauthorizedMintAuthority
        );

        require!(
            token_account.mint == token_mint.key(),
            TokenError::InvalidTokenAccount
        );

        token_account.amount = token_account.amount.checked_add(amount)
            .ok_or(TokenError::CalculationOverflow)?;
            
        token_mint.total_supply = token_mint.total_supply.checked_add(amount)
            .ok_or(TokenError::CalculationOverflow)?;

        msg!("Minted {} tokens to {}", amount, token_account.owner);
        Ok(())
    }

    pub fn burn(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        let token_mint = &mut ctx.accounts.token_mint;
        let token_account = &mut ctx.accounts.token_account;
        let owner = &ctx.accounts.owner;

        require!(
            token_account.owner == owner.key(),
            TokenError::UnauthorizedTokenHolder
        );

        require!(
            token_account.mint == token_mint.key(),
            TokenError::InvalidTokenAccount
        );

        require!(
            token_account.amount >= amount,
            TokenError::InsufficientFunds
        );

        token_account.amount = token_account.amount.checked_sub(amount)
            .ok_or(TokenError::CalculationOverflow)?;
            
        token_mint.total_supply = token_mint.total_supply.checked_sub(amount)
            .ok_or(TokenError::CalculationOverflow)?;

        msg!("Burned {} tokens from {}", amount, token_account.owner);
        Ok(())
    }

    pub fn transfer(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
        let from = &mut ctx.accounts.from;
        let to = &mut ctx.accounts.to;
        let owner = &ctx.accounts.owner;

        require!(
            from.owner == owner.key(),
            TokenError::UnauthorizedTokenHolder
        );

        require!(
            from.mint == to.mint,
            TokenError::MintMismatch
        );

        require!(
            from.amount >= amount,
            TokenError::InsufficientFunds
        );

        from.amount = from.amount.checked_sub(amount)
            .ok_or(TokenError::CalculationOverflow)?;
            
        to.amount = to.amount.checked_add(amount)
            .ok_or(TokenError::CalculationOverflow)?;

        msg!("Transferred {} tokens from {} to {}", amount, from.owner, to.owner);
        Ok(())
    }
}

#[account]
pub struct TokenMint {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub authority: Pubkey,
    pub total_supply: u64,
}

#[account]
pub struct TokenAccount {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 16 + 1 + 32 + 8)]
    pub token_mint: Account<'info, TokenMint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateAccount<'info> {
    pub token_mint: Account<'info, TokenMint>,
    
    #[account(init, payer = owner, space = 8 + 32 + 32 + 8)]
    pub token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub token_mint: Account<'info, TokenMint>,
    
    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub token_mint: Account<'info, TokenMint>,
    
    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,
    
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    
    pub owner: Signer<'info>,
}

#[error_code]
pub enum TokenError {
    #[msg("Mint authority is invalid")]
    UnauthorizedMintAuthority,
    
    #[msg("Token holder is not authorized")]
    UnauthorizedTokenHolder,
    
    #[msg("Insufficient funds")]
    InsufficientFunds,
    
    #[msg("Calculation overflow")]
    CalculationOverflow,

    #[msg("Invalid token account")]
    InvalidTokenAccount,

    #[msg("Mint mismatch between accounts")]
    MintMismatch,
}
