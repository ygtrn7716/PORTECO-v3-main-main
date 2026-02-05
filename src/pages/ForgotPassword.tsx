// src/pages/ForgotPassword.tsx
import * as React from "react";
import Container from "@/components/layout/Container";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPassword() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: backend entegrasyonu (mail gönderme)
    setSent(true);
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center bg-gradient-to-b from-white to-[#F6F8FB]">
      <Container>
        <div className="max-w-md mx-auto">
          <Card className="border border-black/10">
            <CardContent className="p-6">
              <h1 className="text-2xl font-semibold text-neutral-dark text-center">
                Şifreyi Sıfırla
              </h1>

              {!sent ? (
                <form className="mt-6 space-y-4" onSubmit={submit}>
                  <div>
                    <label className="text-sm font-medium text-neutral-dark">
                      E-posta
                    </label>
                    <Input
                      type="email"
                      placeholder="ornek@sirket.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1"
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full">
                    Sıfırlama bağlantısı gönder
                  </Button>

                  <div className="text-sm text-center mt-2">
                    <a href="/login" className="text-brand-blue hover:underline">
                      Giriş sayfasına dön
                    </a>
                  </div>
                </form>
              ) : (
                <div className="mt-6 text-sm text-neutral-dark text-center space-y-3">
                  <p>
                    Eğer <b>{email}</b> adresi sistemde kayıtlıysa,
                    sıfırlama bağlantısı gönderildi.
                  </p>
                  <a href="/login" className="text-brand-blue hover:underline">
                    Giriş sayfasına dön
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Container>
    </div>
  );
}
