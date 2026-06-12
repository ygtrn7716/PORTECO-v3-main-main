// src/pages/Login.tsx
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: Location } };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setResetSent(false);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error(error);
      setErrorMsg("❌ Hatalı e-posta veya şifre. Lütfen tekrar deneyin.");
    } else {
      // ProtectedRoute'tan geldiysek oraya dön, yoksa /dashboard
      const target =
        location.state?.from?.pathname && location.state.from.pathname !== "/login"
          ? location.state.from.pathname
          : "/dashboard";

      navigate(target, { replace: true });
    }

    setLoading(false);
  };

  const handlePasswordReset = async () => {
    setErrorMsg(null);
    setResetSent(false);

    if (!email) {
      setErrorMsg("📧 Şifre sıfırlamak için önce e-posta adresinizi girin.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setErrorMsg("⚠️ Şifre sıfırlama e-postası gönderilirken bir hata oluştu.");
    } else {
      setResetSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F8FB] p-6 font-sans text-[#0F1C2E]">
      <div
        className="w-full max-w-[380px] bg-white rounded-2xl p-7 border border-black/10"
        style={{ boxShadow: "0 8px 30px rgba(0,0,0,.06)" }}
      >
        {/* Marka kilidi (wordmark) */}
        <div className="flex justify-center mb-6">
          <span className="text-[26px] font-bold leading-none text-[#0F1C2E]">
            PortEco
          </span>
        </div>

        {/* Başlık */}
        <h1 className="text-[20px] font-semibold mb-5 text-[#0F1C2E]">
          Giriş Yap
        </h1>

        {/* Hata bildirimi */}
        {errorMsg && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-[#FEF2F2] text-[#B91C1C] px-3 py-2.5 text-sm"
          >
            {errorMsg}
          </div>
        )}

        {/* Başarılı sıfırlama bildirimi */}
        {resetSent && (
          <div
            role="status"
            className="mb-4 rounded-lg bg-[#ECFDF5] text-[#047857] px-3 py-2.5 text-sm"
          >
            ✅ Şifre sıfırlama e-postası gönderildi.
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {/* E-posta */}
          <div className="space-y-1.5">
            <label
              htmlFor="login-email"
              className="block text-xs font-medium text-[#475569]"
            >
              E-posta
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="email@ornek.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-[42px] rounded-lg border border-black/10 px-3 text-sm text-[#0F1C2E] placeholder:text-[#94A3B8] outline-none transition-shadow motion-reduce:transition-none focus:border-[#0A66FF] focus:ring-[3px] focus:ring-[#0A66FF]/[0.18]"
              required
            />
          </div>

          {/* Şifre */}
          <div className="space-y-1.5">
            <label
              htmlFor="login-password"
              className="block text-xs font-medium text-[#475569]"
            >
              Şifre
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="Şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-[42px] rounded-lg border border-black/10 px-3 text-sm text-[#0F1C2E] placeholder:text-[#94A3B8] outline-none transition-shadow motion-reduce:transition-none focus:border-[#0A66FF] focus:ring-[3px] focus:ring-[#0A66FF]/[0.18]"
              required
            />
          </div>

          {/* Şifremi unuttum */}
          <div className="text-right">
            <button
              type="button"
              onClick={handlePasswordReset}
              className="text-[13px] text-[#0A66FF] hover:underline"
            >
              Şifremi unuttum
            </button>
          </div>

          {/* Giriş butonu */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-lg bg-[#0A66FF] text-white font-semibold text-sm transition-colors motion-reduce:transition-none hover:bg-[#0A59E0] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
            {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
          </button>
        </form>
      </div>
    </div>
  );
}
