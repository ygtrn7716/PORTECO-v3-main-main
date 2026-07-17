// src/components/admin/dataHealth/Modal.tsx
// Veri Sağlığı modalleri için hafif, paylaşılan kabuk.
// <form> kullanılmaz; kapatma onClick + ESC ile.
import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = "max-w-3xl",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`relative z-[81] w-full ${maxWidth} my-4 rounded-2xl border border-neutral-200 bg-white shadow-xl`}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-neutral-200">
          <div className="min-w-0">
            <div className="text-base font-semibold text-neutral-900 truncate">{title}</div>
            {subtitle && <div className="text-sm text-neutral-500 mt-0.5">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 h-9 w-9 rounded-full border border-neutral-200 hover:bg-neutral-50 grid place-items-center text-neutral-500"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
