//src/components/dashboard/DetailLayout.tsx
import SideBar from "@/components/dashboard/SideBar";

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;   // sağ üst aksiyon bölgesi (ops.)
  children: React.ReactNode;
};

export default function DetailLayout({ title, subtitle, right, children }: Props) {
  return (
    <div className="bg-[#F6F8FB] pt-[76px]">
      <div className="flex min-h-[calc(100vh-76px)] gap-6">
        <SideBar />
        <main className="flex-1 mt-6 px-6 md:px-8 lg:px-10 xl:px-12 pb-16">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
              {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
            </div>
            {right}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
