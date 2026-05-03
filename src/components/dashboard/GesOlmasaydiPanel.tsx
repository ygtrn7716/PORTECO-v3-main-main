// src/components/dashboard/GesOlmasaydiPanel.tsx
//
// GES olmasaydı fatura karşılaştırma paneli — sağdan açılan drawer.

import { X, Sun, Loader2 } from "lucide-react";
import type { GesOlmasaydiResult } from "@/components/utils/calculateGesOlmasaydi";
import GesSavingsCard from "@/components/dashboard/shared/GesSavingsCard";

interface Props {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  result: GesOlmasaydiResult | null;
  error?: string | null;
}

export default function GesOlmasaydiPanel({ open, onClose, loading, result, error }: Props) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-[400px] max-w-[90vw] bg-white shadow-2xl z-50
          transform transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-neutral-800">
              GES Olmasaydı Faturanız
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto h-[calc(100%-57px)]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <span className="text-sm">Hesaplanıyor...</span>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && !result && (
            <div className="text-sm text-neutral-500 text-center py-8">
              GES üretim verisi bulunamadı.
            </div>
          )}

          {!loading && result && (
            <GesSavingsCard variant="panel" result={result} />
          )}
        </div>
      </div>
    </>
  );
}
