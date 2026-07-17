// src/components/dashboard/shared/SegmentedTabs.tsx
//
// Ortak "Çekiş Değerleri / Veriş Değerleri" tarzı segmented control.
// ReactiveSection (dashboard reaktif kartı) ve ConsumptionCharts (tüketim
// grafikleri) aynı görsel dili paylaşsın diye buraya çıkarıldı.

type Tab<T extends string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (key: T) => void;
};

export default function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: Props<T>) {
  return (
    <div className="inline-flex rounded-lg bg-neutral-100 p-1 self-start w-full sm:w-auto">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={
            "flex-1 sm:flex-none rounded-md px-4 py-2 text-sm font-medium transition-all " +
            (value === tab.key
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700")
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
