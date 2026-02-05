// /src/components/sections/about/CtaContact.tsx
import Container from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function CtaContact() {
  return (
    <section className="py-16">
      <Container>
        <Card>
          <CardContent className="p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h3 className="text-xl font-semibold text-neutral-dark">İletişime geçelim</h3>
              <p className="text-neutral-gray mt-1">
                info@ecoenerji.com • +90 (212) 000 00 00
              </p>
            </div>
            <Button variant="secondary" size="lg">Teklif Al</Button>
          </CardContent>
        </Card>
      </Container>
    </section>
  );
}
