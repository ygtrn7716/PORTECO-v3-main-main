import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Settings,
  Zap,
  FileText,
  Bell,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  Phone,
  MessageSquare,
  Building2,
  BarChart3,
  Clock,
  CalendarDays,
  TrendingUp,
  Receipt,
  AlertTriangle,
  Calculator,
} from "lucide-react";

type NavItem = {
  label: string;
  to: string;
  icon: React.ReactNode;
};

type NavCategory = {
  title: string;
  icon: React.ReactNode;
  items: NavItem[];
};

const NAV_CATEGORIES: NavCategory[] = [
  {
    title: "Genel Bakış",
    icon: <LayoutDashboard size={18} />,
    items: [
      { label: "Admin Home", to: "/dashboard/admin", icon: <LayoutDashboard size={16} /> },
    ],
  },
  {
    title: "Kullanıcılar",
    icon: <Users size={18} />,
    items: [
      { label: "User Integrations", to: "/dashboard/admin/user-integrations", icon: <Users size={16} /> },
      { label: "Owner Subscriptions", to: "/dashboard/admin/owner-subscriptions", icon: <Building2 size={16} /> },
      { label: "Notification Channels", to: "/dashboard/admin/notification-channels", icon: <Bell size={16} /> },
      { label: "User Phone Numbers", to: "/dashboard/admin/user-phone-numbers", icon: <Phone size={16} /> },
      { label: "SMS Logs", to: "/dashboard/admin/sms-logs", icon: <MessageSquare size={16} /> },
    ],
  },
  {
    title: "Tesis Ayarları",
    icon: <Settings size={18} />,
    items: [
      { label: "Subscription Settings", to: "/dashboard/admin/subscription-settings", icon: <Settings size={16} /> },
      { label: "Subscription YEKDEM", to: "/dashboard/admin/subscription-yekdem", icon: <Zap size={16} /> },
      { label: "Distribution Tariff", to: "/dashboard/admin/distribution-tariff", icon: <BarChart3 size={16} /> },
    ],
  },
  {
    title: "Tüketim & Ölçüm",
    icon: <Clock size={18} />,
    items: [
      { label: "EPIAS PTF", to: "/dashboard/admin/epias-ptf", icon: <BarChart3 size={16} /> },
    ],
  },
  {
    title: "Fatura & Hesaplama",
    icon: <Receipt size={18} />,
    items: [
      { label: "Invoice Snapshots", to: "/dashboard/admin/invoice-snapshots", icon: <Receipt size={16} /> },
      { label: "Reactive Alerts", to: "/dashboard/admin/reactive-alerts", icon: <AlertTriangle size={16} /> },
      { label: "Aylık Özet", to: "/dashboard/admin/monthly-overview", icon: <Calculator size={16} /> },
    ],
  },
  {
    title: "İçerik",
    icon: <FileText size={18} />,
    items: [
      { label: "Blog Posts", to: "/dashboard/admin/posts", icon: <FileText size={16} /> },
      { label: "İletişim Mesajları", to: "/dashboard/admin/contact-messages", icon: <MessageSquare size={16} /> },
    ],
  },
  {
    title: "Olaylar",
    icon: <Bell size={18} />,
    items: [
      { label: "Notification Events", to: "/dashboard/admin/notification-events", icon: <Bell size={16} /> },
    ],
  },
];

export default function AdminSidebar({
  expanded = true,
  onToggle,
}: {
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    NAV_CATEGORIES.forEach((c) => { init[c.title] = true; });
    return init;
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  function toggleCat(title: string) {
    setOpenCats((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  const navContent = (mobile?: boolean) => (
    <nav className="px-2 pb-4 text-sm space-y-1 overflow-y-auto flex-1">
      {NAV_CATEGORIES.map((cat) => {
        const isOpen = openCats[cat.title] ?? true;
        return (
          <div key={cat.title}>
            <button
              onClick={() => toggleCat(cat.title)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wide hover:text-neutral-700 transition"
            >
              {expanded || mobile ? (
                <>
                  {cat.icon}
                  <span className="flex-1 text-left">{cat.title}</span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </>
              ) : (
                <span className="mx-auto">{cat.icon}</span>
              )}
            </button>
            {(isOpen || !expanded) && (
              <div className={expanded || mobile ? "ml-2" : ""}>
                {cat.items.map((it) => (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.to === "/dashboard/admin"}
                    onClick={() => mobile && setOpen(false)}
                    className={({ isActive }) =>
                      [
                        "group relative flex items-center gap-2 rounded-lg transition",
                        expanded || mobile ? "px-3 py-1.5" : "justify-center px-0 py-1.5",
                        isActive
                          ? "bg-neutral-100 text-neutral-900 ring-1 ring-neutral-200"
                          : "text-neutral-600 hover:bg-[#0A66FF] hover:text-white",
                      ].join(" ")
                    }
                  >
                    {it.icon}
                    {(expanded || mobile) && <span>{it.label}</span>}
                    {!expanded && !mobile && (
                      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 opacity-0 group-hover:opacity-100 transition z-50">
                        <div className="whitespace-nowrap rounded-lg bg-neutral-900 text-white text-xs px-3 py-2 shadow-lg">
                          {it.label}
                        </div>
                      </div>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* MOBILE: Menü butonu */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden fixed left-4 top-[92px] z-[60] inline-flex items-center gap-2 rounded-xl border border-neutral-200/70 bg-white/70 px-3 py-2 text-sm text-neutral-800 shadow-sm backdrop-blur hover:bg-white/90 active:scale-[0.98] transition"
        aria-label="Admin Menü"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-neutral-200 bg-white/70">
          ☰
        </span>
        <span className="font-medium">Admin</span>
      </button>

      {/* MOBILE DRAWER */}
      <div
        className={[
          "md:hidden fixed inset-0 z-[70]",
          open ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={[
            "absolute inset-0 bg-black/40 transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
        <aside
          className={[
            "absolute left-0 top-0 h-full w-[300px] max-w-[85vw] bg-white shadow-xl flex flex-col",
            "transition-transform duration-300 ease-in-out",
            open ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <div className="px-4 py-4 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[#0A66FF]/10 flex items-center justify-center shrink-0">
                <LayoutDashboard size={20} className="text-[#0A66FF]" />
              </div>
              <div className="leading-tight">
                <div className="text-[14px] font-semibold text-neutral-900">Admin Panel</div>
                <div className="text-[12px] text-neutral-500">PORTECO</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 w-9 rounded-full border border-neutral-200 hover:bg-neutral-50 grid place-items-center text-neutral-700"
              aria-label="Kapat"
            >
              ✕
            </button>
          </div>
          {navContent(true)}
          <div className="px-4 py-4 text-[11px] text-neutral-400">
            © {new Date().getFullYear()} ECO Enerji
          </div>
        </aside>
      </div>

      {/* DESKTOP */}
      <aside className="hidden md:flex self-stretch">
        <div
          className={[
            "rounded-2xl border bg-white shadow-sm overflow-hidden flex flex-col",
            "transition-[width] duration-300 ease-in-out",
            expanded ? "w-[260px]" : "w-[72px]",
          ].join(" ")}
        >
          {/* Header */}
          <div
            className={[
              "px-4 py-4 flex items-center",
              expanded ? "justify-between" : "justify-center",
            ].join(" ")}
          >
            <div className={["flex items-center gap-3", expanded ? "" : "justify-center w-full"].join(" ")}>
              <div className="h-10 w-10 rounded-full bg-[#0A66FF]/10 flex items-center justify-center shrink-0">
                <LayoutDashboard size={20} className="text-[#0A66FF]" />
              </div>
              {expanded && (
                <div className="leading-tight">
                  <div className="text-[14px] font-semibold text-neutral-900">Admin Panel</div>
                  <div className="text-[12px] text-neutral-500">PORTECO</div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="h-8 w-8 rounded-full border border-neutral-200 hover:bg-neutral-50 grid place-items-center text-neutral-500"
              aria-label={expanded ? "Sidebar küçült" : "Sidebar büyüt"}
            >
              {expanded ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
            </button>
          </div>

          {navContent()}

          <div className={["mt-auto px-4 py-4 text-[11px] text-neutral-400", expanded ? "" : "text-center"].join(" ")}>
            © {new Date().getFullYear()} ECO Enerji
          </div>
        </div>
      </aside>
    </>
  );
}
