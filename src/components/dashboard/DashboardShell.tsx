// src/components/dashboard/DashboardShell.tsx
import { ReactNode, useState } from "react";
import SideBar from "@/components/dashboard/SideBar";

export default function DashboardShell({
  children,
  defaultExpanded = true,
}: {
  children: ReactNode;
  defaultExpanded?: boolean;
}) {
  const [sidebarExpanded, setSidebarExpanded] = useState(defaultExpanded);

  return (
    <div className="min-h-dvh bg-[#F6F8FB] pt-[76px] overflow-x-hidden">
      <div
        className={[
          "mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 py-6",
          "md:grid gap-6",
          // ✅ grid kolon genişliği sidebar’a göre değişsin + animasyon
          "transition-[grid-template-columns] duration-300 ease-in-out",
          sidebarExpanded
            ? "md:grid-cols-[260px_1fr]"
            : "md:grid-cols-[80px_1fr]",
        ].join(" ")}
        style={{
          // Tailwind grid-template-columns transition bazen stubborn oluyor.
          // Bu inline style animasyonu garanti eder:
          gridTemplateColumns: sidebarExpanded ? "260px 1fr" : "80px 1fr",
        }}
      >
        <SideBar
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded((v) => !v)}
        />

        {/* ✅ main tarafı da yumuşak genişlesin */}
        <main className="min-w-0 transition-all duration-300 ease-in-out">
          {children}
        </main>
      </div>
    </div>
  );
}
