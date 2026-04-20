import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PmAmm } from "../target/types/pm_amm";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
} from "@solana/spl-token";
import { assert } from "chai";

describe("pm_amm", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.pmAmm as Program<PmAmm>;
  const authority = provider.wallet as anchor.Wallet;

  let collateralMint: PublicKey;
  let marketId: anchor.BN;
  let marketPda: PublicKey;
  let marketBump: number;

  before(async () => {
    // Create mock USDC mint (decimals 6)
    collateralMint = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      6
    );
  });

  it("initialize_market", async () => {
    marketId = new anchor.BN(1);

    // Derive Market PDA
    [marketPda, marketBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // YES and NO mints — Anchor will init them, we just need keypairs
    const yesMint = Keypair.generate();
    const noMint = Keypair.generate();
    const vault = Keypair.generate();

    // end_ts = now + 7 days
    const now = Math.floor(Date.now() / 1000);
    const endTs = new anchor.BN(now + 86400 * 7);

    await program.methods
      .initializeMarket(marketId, endTs)
      .accounts({
        authority: authority.publicKey,
        market: marketPda,
        collateralMint,
        yesMint: yesMint.publicKey,
        noMint: noMint.publicKey,
        vault: vault.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([yesMint, noMint, vault])
      .rpc();

    // Fetch and verify state
    const market = await program.account.market.fetch(marketPda);

    assert.ok(
      market.authority.equals(authority.publicKey),
      "authority mismatch"
    );
    assert.ok(market.marketId.eq(marketId), "marketId mismatch");
    assert.ok(
      market.collateralMint.equals(collateralMint),
      "collateralMint mismatch"
    );
    assert.ok(
      market.yesMint.equals(yesMint.publicKey),
      "yesMint mismatch"
    );
    assert.ok(
      market.noMint.equals(noMint.publicKey),
      "noMint mismatch"
    );
    assert.ok(
      market.vault.equals(vault.publicKey),
      "vault mismatch"
    );

    // Timestamps
    assert.ok(market.startTs.toNumber() > 0, "startTs should be set");
    assert.ok(
      market.endTs.eq(endTs),
      "endTs mismatch"
    );

    // AMM params — should be zero (no liquidity yet)
    assert.ok(
      market.lZero.eq(new anchor.BN(0)),
      "lZero should be 0"
    );
    assert.ok(
      market.reserveYes.eq(new anchor.BN(0)),
      "reserveYes should be 0"
    );
    assert.ok(
      market.reserveNo.eq(new anchor.BN(0)),
      "reserveNo should be 0"
    );

    // Accrual accumulators
    assert.ok(
      market.cumYesPerShare.eq(new anchor.BN(0)),
      "cumYesPerShare should be 0"
    );
    assert.ok(
      market.cumNoPerShare.eq(new anchor.BN(0)),
      "cumNoPerShare should be 0"
    );
    assert.equal(
      market.lastAccrualTs.toNumber(),
      market.startTs.toNumber(),
      "lastAccrualTs should equal startTs"
    );

    // Stats
    assert.equal(
      market.totalYesDistributed.toNumber(),
      0,
      "totalYesDistributed"
    );
    assert.equal(
      market.totalNoDistributed.toNumber(),
      0,
      "totalNoDistributed"
    );

    // LP
    assert.ok(
      market.totalLpShares.eq(new anchor.BN(0)),
      "totalLpShares should be 0"
    );

    // Resolution
    assert.equal(market.resolved, false, "should not be resolved");
    assert.equal(market.winningSide, 0, "winningSide should be 0");

    // Bump
    assert.equal(market.bump, marketBump, "bump mismatch");
  });

  it("rejects end_ts < now + 1h", async () => {
    const badId = new anchor.BN(999);
    const [badPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), badId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const yesMint = Keypair.generate();
    const noMint = Keypair.generate();
    const vault = Keypair.generate();

    // end_ts = now + 30 min (less than 1h)
    const now = Math.floor(Date.now() / 1000);
    const badEndTs = new anchor.BN(now + 1800);

    try {
      await program.methods
        .initializeMarket(badId, badEndTs)
        .accounts({
          authority: authority.publicKey,
          market: badPda,
          collateralMint,
          yesMint: yesMint.publicKey,
          noMint: noMint.publicKey,
          vault: vault.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([yesMint, noMint, vault])
        .rpc();
      assert.fail("Should have thrown InvalidDuration");
    } catch (err) {
      assert.include(err.toString(), "InvalidDuration");
    }
  });
});
