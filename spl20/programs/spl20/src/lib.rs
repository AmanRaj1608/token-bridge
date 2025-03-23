use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, Transfer};

declare_id!("8X3gPhhqv562jvPgK7Yj7VWwSjYjcsxUuedJKcic8Pwf");

#[program]
pub mod spl20 {
    use super::*;

    pub fn initialize_bridge(ctx: Context<InitializeBridge>, token_mint: Pubkey) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge;
        bridge.authority = ctx.accounts.authority.key();
        bridge.token_mint = token_mint;

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // Transfer tokens from user to bridge
        let transfer_instruction = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.bridge_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
        );

        token::transfer(cpi_ctx, amount)?;

        // Emit deposit event
        emit!(DepositEvent {
            user: ctx.accounts.owner.key(),
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn burn_for_bridge(
        ctx: Context<BurnForBridge>,
        from: Pubkey,
        destination: String,
        amount: u64,
    ) -> Result<()> {
        // Check if caller is the bridge authority
        if ctx.accounts.authority.key() != ctx.accounts.bridge.authority {
            return err!(ErrorCode::UnauthorizedBridgeAuthority);
        }

        // Transfer tokens from bridge to burn account
        let transfer_instruction = Transfer {
            from: ctx.accounts.bridge_token_account.to_account_info(),
            to: ctx.accounts.burn_account.to_account_info(),
            authority: ctx.accounts.bridge.to_account_info(),
        };

        let seeds = &[b"flappy_bridge".as_ref(), &[ctx.bumps.bridge]];
        let signer = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
            signer,
        );

        token::transfer(cpi_ctx, amount)?;

        // Emit cross-chain transfer event
        emit!(CrossChainTransferEvent {
            from,
            destination,
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn complete_transfer(
        ctx: Context<CompleteTransfer>,
        recipient: Pubkey,
        amount: u64,
        source_chain: String,
        source_tx_hash: String,
    ) -> Result<()> {
        // Check if caller is the bridge authority
        if ctx.accounts.authority.key() != ctx.accounts.bridge.authority {
            return err!(ErrorCode::UnauthorizedBridgeAuthority);
        }

        // Transfer tokens from authority to user
        let transfer_instruction = Transfer {
            from: ctx.accounts.authority_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
        );

        token::transfer(cpi_ctx, amount)?;

        // Emit transfer completion event
        emit!(TransferCompletedEvent {
            to: recipient,
            amount,
            source_chain,
            source_tx_hash,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn emergency_withdraw(ctx: Context<EmergencyWithdraw>, amount: u64) -> Result<()> {
        // Check if caller is the bridge authority
        if ctx.accounts.authority.key() != ctx.accounts.bridge.authority {
            return err!(ErrorCode::UnauthorizedBridgeAuthority);
        }

        // Transfer tokens from bridge to authority
        let transfer_instruction = Transfer {
            from: ctx.accounts.bridge_token_account.to_account_info(),
            to: ctx.accounts.authority_token_account.to_account_info(),
            authority: ctx.accounts.bridge.to_account_info(),
        };

        let seeds = &[b"flappy_bridge".as_ref(), &[ctx.bumps.bridge]];
        let signer = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
            signer,
        );

        token::transfer(cpi_ctx, amount)?;

        // Emit emergency withdrawal event
        emit!(EmergencyWithdrawEvent {
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeBridge<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32, // discriminator + authority + token_mint
        seeds = [b"flappy_bridge"],
        bump
    )]
    pub bridge: Account<'info, FlappyBridge>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Deposit<'info> {
    #[account(
        seeds = [b"flappy_bridge"],
        bump
    )]
    pub bridge: Account<'info, FlappyBridge>,

    /// CHECK: This is a token account that must be owned by the owner
    #[account(mut)]
    pub user_token_account: AccountInfo<'info>,

    /// CHECK: This is the bridge token account
    #[account(mut)]
    pub bridge_token_account: AccountInfo<'info>,

    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(from: Pubkey, destination: String, amount: u64)]
pub struct BurnForBridge<'info> {
    #[account(
        seeds = [b"flappy_bridge"],
        bump,
    )]
    pub bridge: Account<'info, FlappyBridge>,

    /// CHECK: This is the bridge token account
    #[account(mut)]
    pub bridge_token_account: AccountInfo<'info>,

    /// CHECK: This is the burn token account
    #[account(mut)]
    pub burn_account: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(recipient: Pubkey, amount: u64, source_chain: String, source_tx_hash: String)]
pub struct CompleteTransfer<'info> {
    #[account(
        seeds = [b"flappy_bridge"],
        bump,
    )]
    pub bridge: Account<'info, FlappyBridge>,

    #[account(
        address = bridge.token_mint
    )]
    pub mint: Account<'info, Mint>,

    /// CHECK: This is the authority's token account
    #[account(mut)]
    pub authority_token_account: AccountInfo<'info>,

    /// CHECK: This is the user's token account
    #[account(mut)]
    pub user_token_account: AccountInfo<'info>,

    /// CHECK: This is the recipient of the transfer
    pub recipient: AccountInfo<'info>,

    #[account(
        mut,
        constraint = authority.key() == bridge.authority
    )]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct EmergencyWithdraw<'info> {
    #[account(
        seeds = [b"flappy_bridge"],
        bump,
    )]
    pub bridge: Account<'info, FlappyBridge>,

    /// CHECK: This is the bridge token account
    #[account(mut)]
    pub bridge_token_account: AccountInfo<'info>,

    /// CHECK: This is the authority's token account
    #[account(mut)]
    pub authority_token_account: AccountInfo<'info>,

    #[account(
        mut,
        constraint = authority.key() == bridge.authority
    )]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct FlappyBridge {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Caller is not authorized to perform this action")]
    UnauthorizedBridgeAuthority,
}

// Events
#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct CrossChainTransferEvent {
    pub from: Pubkey,
    pub destination: String,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct TransferCompletedEvent {
    pub to: Pubkey,
    pub amount: u64,
    pub source_chain: String,
    pub source_tx_hash: String,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyWithdrawEvent {
    pub amount: u64,
    pub timestamp: i64,
}
