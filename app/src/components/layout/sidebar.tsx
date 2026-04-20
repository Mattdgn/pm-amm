"use client";

import { useMarkets } from "@/hooks/use-markets";

interface SidebarItemProps {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  swatch?: string;
}

function SidebarItem({ label, count, active, onClick, swatch }: SidebarItemProps) {
  return (
    <div
      onClick={onClick}
      className={[
        "flex items-center justify-between",
        "px-[20px] py-[7px]",
        "text-text-dim cursor-pointer select-none",
        "border-l-2",
        "transition-all duration-[120ms]",
        active
          ? "text-text-hi border-l-accent bg-surface"
          : "border-l-transparent hover:text-text-hi hover:bg-surface",
      ].join(" ")}
    >
      <span className="flex items-center gap-[8px]">
        {swatch && (
          <span
            className="inline-block w-[8px] h-[8px] rounded-[1px]"
            style={{ background: swatch }}
          />
        )}
        {label}
      </span>
      {count !== undefined && (
        <span className="text-muted text-[11px]">{count}</span>
      )}
    </div>
  );
}

function SidebarTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-muted uppercase tracking-[0.08em] px-[20px] mt-[16px] mb-[8px] first:mt-0">
      {children}
    </div>
  );
}

export type SidebarFilter = "all" | "positions" | "active" | "expiring" | "resolved";
export type SidebarSort = "tvl" | "volume" | "expiry" | "newest";

interface SidebarProps {
  filter: SidebarFilter;
  sort: SidebarSort;
  onFilterChange: (f: SidebarFilter) => void;
  onSortChange: (s: SidebarSort) => void;
  positionCount?: number;
}

export function Sidebar({ filter, sort, onFilterChange, onSortChange, positionCount = 0 }: SidebarProps) {
  const { data: markets } = useMarkets();

  const total = markets?.length ?? 0;
  const active = markets?.filter((m) => !m.resolved).length ?? 0;
  const expiring = markets?.filter((m) => {
    if (m.resolved) return false;
    const remaining = m.endTs - Math.floor(Date.now() / 1000);
    return remaining > 0 && remaining < 86400;
  }).length ?? 0;
  const resolved = markets?.filter((m) => m.resolved).length ?? 0;

  return (
    <aside className="border-r border-line py-[20px] font-mono text-[12px] hidden lg:block">
      <SidebarTitle>View</SidebarTitle>
      <SidebarItem label="All markets" count={total} active={filter === "all"} onClick={() => onFilterChange("all")} />
      <SidebarItem label="My positions" count={positionCount || undefined} active={filter === "positions"} onClick={() => onFilterChange("positions")} />

      <SidebarTitle>Status</SidebarTitle>
      <SidebarItem label="Active" count={active} active={filter === "active"} onClick={() => onFilterChange("active")} />
      <SidebarItem label="Expiring <24h" count={expiring} active={filter === "expiring"} onClick={() => onFilterChange("expiring")} />
      <SidebarItem label="Resolved" count={resolved} active={filter === "resolved"} onClick={() => onFilterChange("resolved")} />

      <SidebarTitle>Sort</SidebarTitle>
      <SidebarItem label="TVL · desc" active={sort === "tvl"} onClick={() => onSortChange("tvl")} />
      <SidebarItem label="Expiry · soonest" active={sort === "expiry"} onClick={() => onSortChange("expiry")} />
      <SidebarItem label="Newest" active={sort === "newest"} onClick={() => onSortChange("newest")} />
    </aside>
  );
}
