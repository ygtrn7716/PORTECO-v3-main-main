import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminRoute() {
  const { isAdmin, loading } = useIsAdmin();

  if (loading) return <div className="p-6 text-sm text-neutral-500">Yetki kontrol ediliyor…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <AdminShell />;
}
