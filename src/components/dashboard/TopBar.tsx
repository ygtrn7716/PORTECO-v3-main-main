import { Search, Bell, Calendar } from "lucide-react";
import { Button } from "../ui/button";

export default function TopBar() {
  return (
    <div className="sticky top-0 z-10 border-b border-black/5 bg-white/80 backdrop-blur">
      <div className="mx-auto w-full max-w-[1400px] px-4 md:px-6 h-14 flex items-center justify-between">
        {/* left: title/breadcrumb */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-neutral-gray">Panel</div>
          <div className="text-neutral-dark text-sm font-semibold">Genel Bakış</div>
        </div>

        {/* right: controls */}
        <div className="flex items-center gap-3">
          {/* date range */}
          <button
            className="hidden sm:inline-flex h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-xs hover:bg-neutral-lightBlue"
            title="Tarih aralığı"
          >
            <Calendar className="h-4 w-4" />
            Bugün 
          </button>

          {/* search */}
          <div className="relative hidden md:block">
            <input
              className="h-9 w-64 rounded-md border border-black/10 bg-white pl-8 pr-3 text-xs text-neutral-dark placeholder:text-neutral-gray focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              placeholder="Tesis, sayaç, uyarı ara…"
            />
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-gray" />
          </div>

          {/* notifications */}
          <button className="relative h-9 w-9 rounded-md border border-black/10 hover:bg-neutral-lightBlue">
            <Bell className="mx-auto h-4 w-4 text-neutral-dark" />
            <span className="absolute -right-0 -top-0 h-4 min-w-[16px] rounded-full bg-brand-blue text-[10px] text-white px-[5px] leading-4">
              2
            </span>
          </button>

          {/* export */}
          <Button size="sm">Rapor İndir</Button>
        </div>
      </div>
    </div>
  );
}
