"use client";

/**
 * Mobile-style bottom tab bar. Each tab is a dot + label; the active dot expands
 * into an accent pill. A small green badge marks tabs that have fresh data
 * (Results/Actions once an analysis exists). Purely presentational — the shell
 * owns which page is active.
 */
export interface NavPage {
  id: number;
  label: string;
  /** Show a "has content" badge when this tab isn't the active one. */
  hasData?: boolean;
}

export function BottomNav({
  pages,
  active,
  onSelect,
}: {
  pages: NavPage[];
  active: number;
  onSelect: (id: number) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-sm items-stretch justify-between rounded-2xl border border-border bg-panel/95 px-2 py-2 shadow-lg shadow-black/40 backdrop-blur">
        {pages.map((p) => {
          const isActive = p.id === active;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              aria-current={isActive ? "page" : undefined}
              aria-label={p.label}
              className="flex flex-1 flex-col items-center gap-1.5 rounded-xl py-1 outline-none transition focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="relative flex h-2 items-center">
                <span
                  className={
                    "block h-2 rounded-full transition-all duration-300 " +
                    (isActive ? "w-6 bg-accent" : "w-2 bg-muted/40")
                  }
                />
                {p.hasData && !isActive && (
                  <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-good" />
                )}
              </span>
              <span
                className={
                  "text-[10px] font-medium leading-none transition-colors " +
                  (isActive ? "text-white" : "text-muted")
                }
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
