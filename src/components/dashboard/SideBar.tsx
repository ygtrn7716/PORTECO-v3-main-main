// src/components/dashboard/SideBar.tsx
import { NavLink } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  LayoutDashboard,
  BarChart3,
  Receipt,
  Bell,
  User,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Zap,
} from "lucide-react";

type Item = {
  label: string;
  to: string;
  short?: string;
  icon: ReactNode;
};

const ICON_CLASS = "h-[18px] w-[18px] shrink-0";

const NAV_ITEMS: Item[] = [
  {
    label: "Gösterge Paneli",
    to: "/dashboard",
    short: "Panel",
    icon: <LayoutDashboard className={ICON_CLASS} />,
  },
  {
    label: "Grafikler",
    to: "/dashboard/charts",
    short: "Grafik",
    icon: <BarChart3 className={ICON_CLASS} />,
  },
  {
    label: "Geçmiş Faturalarım",
    to: "/dashboard/invoices",
    short: "Geçmiş",
    icon: <Receipt className={ICON_CLASS} />,
  },
  {
    label: "Uyarılar",
    to: "/dashboard/alerts",
    short: "Uyarı",
    icon: <Bell className={ICON_CLASS} />,
  },
  {
    label: "Profil",
    to: "/dashboard/profile",
    short: "Profil",
    icon: <User className={ICON_CLASS} />,
  },
];

export default function SideBar({
  expanded = true,
  onToggle,
}: {
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const { isAdmin } = useIsAdmin();

  // mobil drawer
  const [open, setOpen] = useState(false);

  // mobil drawer açıkken body scroll kilitle
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* ===== MOBILE: Menü butonu ===== */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden fixed left-4 top-[92px] z-[60] inline-flex items-center gap-2 rounded-xl border border-neutral-200/60 bg-white/80 px-3 py-2.5 text-sm text-neutral-800 shadow-md backdrop-blur-md hover:bg-white/95 active:scale-[0.97] transition-all duration-200"
        aria-label="Menü"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#0A66FF]/10 text-[#0A66FF]">
          <Menu className="h-4 w-4" />
        </span>
        <span className="font-medium">Menü</span>
      </button>

      {/* ===== MOBILE DRAWER ===== */}
      <div
        className={[
          "md:hidden fixed inset-0 z-[70]",
          open ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
        aria-hidden={!open}
      >
        {/* overlay */}
        <div
          onClick={() => setOpen(false)}
          className={[
            "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />

        {/* panel */}
        <aside
          className={[
            "absolute left-0 top-0 h-full w-[300px] max-w-[85vw]",
            "bg-gradient-to-b from-white via-white to-[#F6F8FB] shadow-2xl",
            "transition-transform duration-300 ease-in-out",
            open ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          {/* header */}
          <div className="px-5 py-5 flex items-center justify-between border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#0A66FF] to-[#0A66FF]/80 flex items-center justify-center shrink-0 shadow-md shadow-[#0A66FF]/20">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="leading-tight">
                <div className="text-[14px] font-bold text-neutral-900">ECO Enerji</div>
                <div className="text-[11px] font-medium text-[#0A66FF]/70 tracking-wide uppercase">PORTECO</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 w-9 rounded-xl border border-neutral-200/80 bg-neutral-50 hover:bg-neutral-100 grid place-items-center text-neutral-500 transition-colors duration-200"
              aria-label="Kapat"
              title="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* nav */}
          <nav className="px-3 py-4 text-sm space-y-1">
            {NAV_ITEMS.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === "/dashboard"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                    isActive
                      ? "bg-[#0A66FF] text-white shadow-md shadow-[#0A66FF]/25"
                      : "text-neutral-600 hover:bg-[#0A66FF]/5 hover:text-[#0A66FF]",
                  ].join(" ")
                }
              >
                {it.icon}
                <span className="font-medium">{it.label}</span>
              </NavLink>
            ))}

            {isAdmin && (
              <>
                <div className="my-3 mx-2">
                  <div className="h-px bg-gradient-to-r from-transparent via-neutral-200 to-transparent" />
                </div>
                <NavLink
                  to="/dashboard/admin"
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 font-medium",
                      isActive
                        ? "bg-red-500 text-white shadow-md shadow-red-500/25"
                        : "text-red-500 hover:bg-red-50 hover:text-red-600",
                    ].join(" ")
                  }
                >
                  <ShieldAlert className={ICON_CLASS} />
                  <span>Admin Panel</span>
                </NavLink>
              </>
            )}
          </nav>

          <div className="mt-auto px-5 py-4 text-[11px] text-neutral-400">
            © {new Date().getFullYear()} ECO Enerji
          </div>
        </aside>
      </div>

      {/* ===== DESKTOP ===== */}
      <aside className="hidden md:flex self-stretch">
        <div
          className={[
            "rounded-2xl border border-neutral-200/60 overflow-hidden flex flex-col",
            "bg-gradient-to-b from-white via-white to-[#F8FAFD]",
            "shadow-sm hover:shadow-md transition-all duration-300 ease-in-out",
            expanded ? "w-[260px]" : "w-[80px]",
          ].join(" ")}
          style={{
            transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 300ms ease",
          }}
        >
          {/* Header */}
          <div className="relative px-3 py-4 flex flex-col items-center border-b border-neutral-100/80">
            <div className={[
              "flex items-center w-full transition-all duration-300",
              expanded ? "justify-between" : "justify-center",
            ].join(" ")}>
              {/* Logo + Title */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#0A66FF] to-[#0A66FF]/80 flex items-center justify-center shrink-0 shadow-md shadow-[#0A66FF]/20 transition-transform duration-300 hover:scale-105">
                  <Zap className="h-5 w-5 text-white" />
                </div>

                {expanded && (
                  <div className="leading-tight overflow-hidden">
                    <div className="text-[14px] font-bold text-neutral-900 whitespace-nowrap">ECO Enerji</div>
                    <div className="text-[11px] font-medium text-[#0A66FF]/70 tracking-wide uppercase whitespace-nowrap">PORTECO</div>
                  </div>
                )}
              </div>

              {/* Toggle button - expanded */}
              {expanded && (
                <button
                  type="button"
                  onClick={onToggle}
                  className="h-8 w-8 rounded-lg border border-neutral-200/80 bg-neutral-50/80 hover:bg-[#0A66FF]/10 hover:border-[#0A66FF]/30 hover:text-[#0A66FF] grid place-items-center text-neutral-400 transition-all duration-200 shrink-0"
                  aria-label="Sidebar küçült"
                  title="Küçült"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Toggle button - collapsed (ayrı satır) */}
            {!expanded && (
              <button
                type="button"
                onClick={onToggle}
                className="mt-3 h-8 w-8 rounded-lg border border-neutral-200/80 bg-neutral-50/80 hover:bg-[#0A66FF]/10 hover:border-[#0A66FF]/30 hover:text-[#0A66FF] grid place-items-center text-neutral-400 transition-all duration-200"
                aria-label="Sidebar büyüt"
                title="Büyüt"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Nav */}
          <nav className={["px-2 pb-4 text-sm space-y-1", expanded ? "pt-3" : "pt-3"].join(" ")}>
            {NAV_ITEMS.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === "/dashboard"}
                className={({ isActive }) =>
                  [
                    "group relative flex items-center rounded-xl transition-all duration-200",
                    expanded ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-2.5",
                    isActive
                      ? "bg-[#0A66FF] text-white shadow-md shadow-[#0A66FF]/25"
                      : "text-neutral-500 hover:bg-[#0A66FF]/5 hover:text-[#0A66FF]",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active indicator dot (collapsed mode) */}
                    {!expanded && isActive && (
                      <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-[#0A66FF]" style={{ animation: "activePulse 2s ease-in-out infinite" }} />
                    )}

                    <span className={expanded ? "" : "mx-auto"}>
                      {it.icon}
                    </span>

                    {expanded && (
                      <span className="font-medium whitespace-nowrap">{it.label}</span>
                    )}

                    {/* tooltip (collapsed mode) */}
                    {!expanded && (
                      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-1 group-hover:translate-x-0 z-50">
                        <div className="whitespace-nowrap rounded-lg bg-neutral-900/95 backdrop-blur-sm text-white text-xs px-3 py-2 shadow-xl">
                          {it.label}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            ))}

            {isAdmin && (
              <>
                <div className="my-3 mx-2">
                  <div className="h-px bg-gradient-to-r from-transparent via-neutral-200 to-transparent" />
                </div>
                <NavLink
                  to="/dashboard/admin"
                  className={({ isActive }) =>
                    [
                      "group relative flex items-center rounded-xl transition-all duration-200",
                      expanded ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-2.5",
                      isActive
                        ? "bg-red-500 text-white shadow-md shadow-red-500/25"
                        : "text-red-400 hover:bg-red-50 hover:text-red-600",
                    ].join(" ")
                  }
                >
                  {({ isActive }) => (
                    <>
                      {!expanded && isActive && (
                        <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-red-500" />
                      )}

                      <span className={expanded ? "" : "mx-auto"}>
                        <ShieldAlert className={ICON_CLASS} />
                      </span>

                      {expanded && (
                        <span className="font-semibold whitespace-nowrap">Admin Panel</span>
                      )}

                      {!expanded && (
                        <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-1 group-hover:translate-x-0 z-50">
                          <div className="whitespace-nowrap rounded-lg bg-neutral-900/95 backdrop-blur-sm text-white text-xs px-3 py-2 shadow-xl">
                            Admin Panel
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </NavLink>
              </>
            )}
          </nav>

          {/* Footer */}
          <div className="mt-auto">
            <div className="mx-3 mb-3">
              <div className="h-px bg-gradient-to-r from-transparent via-neutral-200/60 to-transparent" />
            </div>
            <div className={["px-4 py-3 text-[11px] text-neutral-400 transition-all duration-300", expanded ? "" : "text-center px-2"].join(" ")}>
              {expanded ? (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" style={{ animation: "activePulse 2s ease-in-out infinite" }} />
                  <span>Sistem aktif</span>
                  <span className="ml-auto text-neutral-300">v3.0</span>
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" style={{ animation: "activePulse 2s ease-in-out infinite" }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
