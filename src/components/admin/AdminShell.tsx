import { useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";

export default function AdminShell() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="flex gap-4 p-4 pt-[76px] min-h-screen">
      <AdminSidebar expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
