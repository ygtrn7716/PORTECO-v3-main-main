import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchHiddenSernos } from "@/lib/subscriptionVisibility";
import type { TesisOption } from "./types";

export function useTesisListForReports(
  uid: string | null,
  sessionLoading: boolean,
): { tesisler: TesisOption[]; loading: boolean; error: string | null } {
  const [tesisler, setTesisler] = useState<TesisOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!uid) {
      setTesisler([]);
      return;
    }

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: osData, error: osErr } = await supabase
          .from("owner_subscriptions")
          .select("subscription_serno, meter_serial, title")
          .eq("user_id", uid)
          .order("subscription_serno", { ascending: true });

        if (cancel) return;
        if (osErr) throw osErr;

        let list: TesisOption[] = [];

        if (osData && osData.length > 0) {
          const sernos = osData
            .map((r: any) => Number(r.subscription_serno))
            .filter((n: any) => Number.isFinite(n));

          const ssMap = new Map<
            number,
            { title: string | null; nickname: string | null }
          >();

          if (sernos.length > 0) {
            const { data: ssData, error: ssErr } = await supabase
              .from("subscription_settings")
              .select("subscription_serno, title, nickname")
              .eq("user_id", uid)
              .in("subscription_serno", sernos);

            if (!cancel && ssErr) {
              console.warn("subscription_settings load warn:", ssErr);
            }

            for (const r of (ssData ?? []) as any[]) {
              const k = Number(r.subscription_serno);
              if (Number.isFinite(k)) {
                ssMap.set(k, {
                  title: r.title ?? null,
                  nickname: r.nickname ?? null,
                });
              }
            }
          }

          list = (osData ?? []).map((r: any) => {
            const serno = Number(r.subscription_serno);
            const ss = ssMap.get(serno);
            const nickname =
              ss?.nickname ?? ss?.title ?? r.title ?? null;
            return {
              subscriptionSerNo: serno,
              meterSerial: r.meter_serial ?? null,
              nickname,
            };
          });
        } else {
          const { data: ssData, error: ssErr } = await supabase
            .from("subscription_settings")
            .select("subscription_serno, title, nickname")
            .eq("user_id", uid)
            .order("subscription_serno", { ascending: true });

          if (cancel) return;
          if (ssErr) throw ssErr;

          list = (ssData ?? []).map((r: any) => ({
            subscriptionSerNo: Number(r.subscription_serno),
            meterSerial: null,
            nickname: r.nickname ?? r.title ?? null,
          }));
        }

        const hidden = await fetchHiddenSernos(uid);
        if (cancel) return;
        const visible = list.filter((s) => !hidden.has(s.subscriptionSerNo));

        setTesisler(visible);
      } catch (e: any) {
        if (!cancel) {
          console.error("useTesisListForReports error:", e);
          setError(e?.message ?? "Tesisler yüklenemedi");
          setTesisler([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading]);

  return { tesisler, loading, error };
}
