import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PmAmm } from "../target/types/pm_amm";
import {
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
} from "@solana/spl-token";
import { assert } from "chai";

// PDA seed constants — must match program
const YES_MINT_SEED = Buffer.from("yes_mint");
const NO_MINT_SEED = Buffer.from("no_mint");
const VAULT_SEED = Buffer.from("vault");

/** Derive all PDAs for a given market_id */
function deriveMarketPdas(marketId: anchor.BN, programId: PublicKey) {
  const [marketPda, marketBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketId.toArrayLike(Buffer, "le", 8)],
    programId
  );
  const [yesMint] = PublicKey.findProgramAddressSync(
    [YES_MINT_SEED, marketPda.toBuffer()],
    programId
  );
  const [noMint] = PublicKey.findProgramAddressSync(
    [NO_MINT_SEED, marketPda.toBuffer()],
    programId
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, marketPda.toBuffer()],
    programId
  );
  return { marketPda, marketBump, yesMint, noMint, vault };
}

describe("pm_amm", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.pmAmm as Program<PmAmm>;
  const authority = provider.wallet as anchor.Wallet;

  let collateralMint: PublicKey;
  let marketId: anchor.BN;
  let pdas: ReturnType<typeof deriveMarketPdas>;

  before(async () => {
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
    pdas = deriveMarketPdas(marketId, program.programId);

    const now = Math.floor(Date.now() / 1000);
    const endTs = new anchor.BN(now + 86400 * 7);

    await program.methods
      .initializeMarket(marketId, endTs)
      .accounts({
        authority: authority.publicKey,
        market: pdas.marketPda,
        collateralMint,
        yesMint: pdas.yesMint,
        noMint: pdas.noMint,
        vault: pdas.vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // Fetch and verify state
    const market = await program.account.market.fetch(pdas.marketPda);

    assert.ok(market.authority.equals(authority.publicKey), "authority");
    assert.ok(market.marketId.eq(marketId), "marketId");
    assert.ok(market.collateralMint.equals(collateralMint), "collateralMint");
    assert.ok(market.yesMint.equals(pdas.yesMint), "yesMint");
    assert.ok(market.noMint.equals(pdas.noMint), "noMint");
    assert.ok(market.vault.equals(pdas.vault), "vault");

    // Timestamps
    assert.ok(market.startTs.toNumber() > 0, "startTs should be set");
    assert.ok(market.endTs.eq(endTs), "endTs");

    // AMM params — should be zero
    assert.ok(market.lZero.eq(new anchor.BN(0)), "lZero");
    assert.ok(market.reserveYes.eq(new anchor.BN(0)), "reserveYes");
    assert.ok(market.reserveNo.eq(new anchor.BN(0)), "reserveNo");

    // Accrual
    assert.ok(market.cumYesPerShare.eq(new anchor.BN(0)), "cumYesPerShare");
    assert.ok(market.cumNoPerShare.eq(new anchor.BN(0)), "cumNoPerShare");
    assert.equal(
      market.lastAccrualTs.toNumber(),
      market.startTs.toNumber(),
      "lastAccrualTs"
    );

    // Stats
    assert.equal(market.totalYesDistributed.toNumber(), 0, "totalYesDistributed");
    assert.equal(market.totalNoDistributed.toNumber(), 0, "totalNoDistributed");

    // LP
    assert.ok(market.totalLpShares.eq(new anchor.BN(0)), "totalLpShares");

    // Resolution
    assert.equal(market.resolved, false, "resolved");
    assert.equal(market.winningSide, 0, "winningSide");

    // Bump
    assert.equal(market.bump, pdas.marketBump, "bump");
  });

  it("PDAs are deterministic — re-derive matches stored", async () => {
    const pdas2 = deriveMarketPdas(marketId, program.programId);
    const market = await program.account.market.fetch(pdas2.marketPda);

    assert.ok(market.yesMint.equals(pdas2.yesMint), "yesMint derivable");
    assert.ok(market.noMint.equals(pdas2.noMint), "noMint derivable");
    assert.ok(market.vault.equals(pdas2.vault), "vault derivable");
  });

  it("rejects end_ts < now + 1h", async () => {
    const badId = new anchor.BN(999);
    const badPdas = deriveMarketPdas(badId, program.programId);

    const now = Math.floor(Date.now() / 1000);
    const badEndTs = new anchor.BN(now + 1800);

    try {
      await program.methods
        .initializeMarket(badId, badEndTs)
        .accounts({
          authority: authority.publicKey,
          market: badPdas.marketPda,
          collateralMint,
          yesMint: badPdas.yesMint,
          noMint: badPdas.noMint,
          vault: badPdas.vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      assert.fail("Should have thrown InvalidDuration");
    } catch (err) {
      assert.include(err.toString(), "InvalidDuration");
    }
  });
});
