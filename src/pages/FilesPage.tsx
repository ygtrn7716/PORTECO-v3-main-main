// src/pages/FilesPage.tsx
import SideBar from "@/components/dashboard/SideBar";
import GeneratedInvoicesSection from "@/components/dashboard/GeneratedInvoicesSection";

export default function FilesPage() {
  return (
    <div className="bg-[#F6F8FB] pt-[76px]">
      <div className="flex min-h-[calc(100vh-76px)] gap-6">
        <SideBar />
        <main className="flex-1 mt-6 px-6 md:px-8 lg:px-10 xl:px-12 pb-16">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-neutral-900">
              Dosyalarım
            </h1>
            <p className="text-sm text-neutral-500">
              Oluşturulmuş faturalarım
            </p>
          </div>

          <GeneratedInvoicesSection />
        </main>
      </div>
    </div>
  );
}
