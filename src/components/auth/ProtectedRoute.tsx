// src/components/auth/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "@/hooks/useSession";

type Props = { children?: JSX.Element };

export default function ProtectedRoute({ children }: Props) {
  const { session, loading } = useSession();
  const location = useLocation();

  // Auth durumu yüklenirken: flicker olmasın
  if (loading) {
    return <div className="p-6 text-sm text-neutral-500">Kontrol ediliyor…</div>;
  }

  // Giriş yoksa login'e yönlendir (geldiği yeri state'e yaz)
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Hem children hem Outlet destekli
  return children ?? <Outlet />;
}
