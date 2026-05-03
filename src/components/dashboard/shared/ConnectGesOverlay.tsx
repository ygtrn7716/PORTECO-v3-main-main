import { Sun } from "lucide-react";

interface Props {
  title?: string;
  /** Override default description; `{email}` placeholder otomatik mailto link olur. */
  descriptionBefore?: string;
  descriptionAfter?: string;
  className?: string;
  compact?: boolean;
}

const DEFAULT_BEFORE =
  "Üretim detaylarını, anlık gücü ve geçmiş grafiklerinizi görebilmek için ";
const DEFAULT_AFTER = " ile iletişime geçin.";
const EMAIL = "info@ecoenerji.net.tr";

export default function ConnectGesOverlay({
  title = "GES panelinizi bağlayın",
  descriptionBefore = DEFAULT_BEFORE,
  descriptionAfter = DEFAULT_AFTER,
  className = "",
  compact = false,
}: Props) {
  return (
    <div
      className={`pointer-events-none flex items-center justify-center ${className}`}
    >
      <div
        className={`pointer-events-auto rounded-2xl border border-amber-200/70 bg-white/95 shadow-xl ${
          compact ? "p-4 max-w-xs" : "p-6 max-w-md"
        } text-center mx-4`}
      >
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
          <Sun className="h-5 w-5 text-amber-500" />
        </div>
        <h3 className={`font-semibold text-neutral-900 ${compact ? "text-sm" : "text-base"}`}>
          {title}
        </h3>
        <p className={`mt-2 text-neutral-600 ${compact ? "text-xs" : "text-sm"} leading-relaxed`}>
          {descriptionBefore}
          <a
            href={`mailto:${EMAIL}?subject=GES%20Panel%20Ba%C4%9Flant%C4%B1%20Talebi`}
            className="font-medium text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800"
          >
            {EMAIL}
          </a>
          {descriptionAfter}
        </p>
      </div>
    </div>
  );
}
