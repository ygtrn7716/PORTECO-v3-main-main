// /src/components/sections/about/StatsStrip.tsx
import Container from "@/components/layout/Container";

type Stat = { k: string; v: string };

export default function StatsStrip({ stats }: { stats: Stat[] }) {
  return (
    <section className="py-10 bg-[#F6F8FB]">
      <Container>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 text-center">
          {stats.map((s, i) => (
            <div key={i}>
              <div className="text-3xl md:text-4xl font-extrabold text-brand-blue">{s.v}</div>
              <div className="text-sm text-neutral-gray mt-1">{s.k}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
