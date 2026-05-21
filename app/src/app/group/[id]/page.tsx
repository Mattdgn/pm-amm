"use client";

import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { StatusBar } from "@/components/layout/status-bar";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/ui/countdown";
import { MetaRow } from "@/components/ui/meta-row";
import { useMarkets } from "@/hooks/use-markets";
import { useGroup } from "@/hooks/use-groups";
import { groupDriftPct, expectedLegSeedPrice } from "@/lib/pm-math";
import { solscanAccountUrl } from "@/lib/constants";

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: markets } = useMarkets();
  const { data: group, isLoading } = useGroup(Number(id), markets);

  return (
    <>
      <StatusBar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-[48px] py-[32px]">
        <Link
          href="/"
          className="text-[12px] text-muted hover:text-text-hi transition-all duration-[120ms] mb-[16px] block font-mono tracking-[0.03em]"
        >
          ← BACK
        </Link>

        {isLoading && <p className="text-muted font-mono text-[12px]">Loading...</p>}
        {!isLoading && !group && (
          <p className="text-no font-mono text-[12px]">Group #{id} not found.</p>
        )}

        {group && <GroupView group={group} />}
      </main>
    </>
  );
}

interface GroupViewProps {
  group: NonNullable<ReturnType<typeof useGroup>["data"]>;
}

function GroupView({ group }: GroupViewProps) {
  const now = Math.floor(Date.now() / 1000);
  const isExpired = now >= group.endTs;
  const isResolved = group.resolved;

  const drift = groupDriftPct(group.legs.filter((m) => m !== null).map((m) => m!.price));
  const expectedSeed = expectedLegSeedPrice(group.legCount);

  const headerBadge = isResolved ? (
    <Badge variant="yes">RESOLVED · Leg #{group.winningLeg}</Badge>
  ) : isExpired ? (
    <Badge variant="no">Awaiting Resolution</Badge>
  ) : (
    <Badge variant="yes" dot>
      Active
    </Badge>
  );

  return (
    <div className="space-y-[24px]">
      <div className="flex items-center gap-[12px] flex-wrap">
        <h2 className="text-title">{group.name}</h2>
        {headerBadge}
        <button
          onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            toast.success("Link copied");
          }}
          className="text-[11px] text-muted hover:text-text-hi transition-all duration-[120ms] font-mono cursor-pointer"
        >
          Copy link
        </button>
        <a
          href={solscanAccountUrl(group.publicKey)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted hover:text-text-hi transition-all duration-[120ms] font-mono"
        >
          Solscan ↗
        </a>
      </div>

      <div className="max-w-md">
        <MetaRow label="Legs" value={`${group.legCount}`} />
        <MetaRow
          label="Σ p_i"
          value={`${group.sumProbabilities.toFixed(4)} (drift ${drift.toFixed(2)}%)`}
        />
        <MetaRow label="Seed price / leg" value={`${(expectedSeed * 100).toFixed(2)}%`} />
        <MetaRow label="Expires" value={<Countdown endTs={group.endTs} />} last />
      </div>

      {!isResolved && drift > 2 && (
        <div className="border border-no/30 bg-no/5 p-[12px] text-[11px] font-mono text-no">
          ⚠ Σ p_i drifts more than 2% from 1. An off-chain rebalance daemon (or live arbitrage) is
          missing. The house treasury is exposed.
        </div>
      )}

      <LegsGrid group={group} />
    </div>
  );
}

interface LegsGridProps {
  group: NonNullable<ReturnType<typeof useGroup>["data"]>;
}

function LegsGrid({ group }: LegsGridProps) {
  return (
    <div>
      <p className="text-caption mb-[12px]">LEGS</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[8px]">
        {group.legs.map((m, i) => {
          const isWinner = group.winningLeg === i;
          const isLoser = group.resolved && !isWinner;

          if (!m) {
            return (
              <div
                key={i}
                className="border border-line p-[12px] opacity-50 font-mono text-[11px] text-muted"
              >
                <p className="uppercase tracking-[0.05em]">Leg {i}</p>
                <p className="mt-[8px]">unattached or unresolved pubkey</p>
                <p className="mt-[4px] text-[9px] break-all opacity-50">{group.legPubkeys[i]}</p>
              </div>
            );
          }

          const className = [
            "border p-[12px] block transition-all duration-[120ms]",
            isWinner
              ? "border-yes bg-yes/10"
              : isLoser
                ? "border-line opacity-40"
                : "border-line hover:border-line-2 hover:bg-surface-2 cursor-pointer",
          ].join(" ");

          return (
            <Link key={i} href={`/market/${m.marketId}`} className={className}>
              <div className="flex items-center justify-between mb-[8px]">
                <span className="text-[10px] font-mono text-muted uppercase tracking-[0.05em]">
                  Leg {i}
                </span>
                {isWinner && <Badge variant="yes">WINNER</Badge>}
                {isLoser && <span className="text-[9px] font-mono text-muted">—</span>}
              </div>
              <p className="text-[13px] mb-[8px] truncate" title={m.name}>
                {m.name}
              </p>
              <div className="flex items-baseline justify-between">
                <span
                  className={`text-[18px] font-mono font-medium tabular-nums ${
                    isWinner ? "text-yes" : "text-text-hi"
                  }`}
                >
                  {(m.price * 100).toFixed(1)}%
                </span>
                <span className="text-[9px] font-mono text-muted">YES</span>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-[10px] font-mono text-muted mt-[12px] uppercase tracking-[0.05em]">
        Tap a leg to bet on it (opens the binary market). Σ drift is corrected off-chain — see
        project docs.
      </p>
    </div>
  );
}
