import { useSession } from "@/hooks/useSession";

export function useIsAdmin() {
  const { session, loading } = useSession();

  const isAdmin = !!session?.user?.app_metadata?.is_admin;

  return { isAdmin, loading };
}
