// src/pages/Login.tsx
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error(error);
      setErrorMsg("❌ Hatalı e-posta veya şifre girdiniz. Lütfen tekrar deneyin.");
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
    if (!email) {
      setErrorMsg("📧 Şifre sıfırlamak için önce e-posta adresinizi girin.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`, // buraya yönlenecek sayfa
    });

    if (error) {
      setErrorMsg("⚠️ Şifre sıfırlama e-postası gönderilirken bir hata oluştu.");
    } else {
      setResetSent(true);
      setErrorMsg(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F8FB] p-6">
      <div className="w-full max-w-sm bg-white border rounded-2xl p-6 shadow">
        <h1 className="text-xl font-semibold mb-4">Giriş Yap</h1>

        {/* Hata mesajı */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-100 text-red-700 px-3 py-2 text-sm">
            {errorMsg}
          </div>
        )}

        {resetSent && (
          <div className="mb-4 rounded bg-green-100 text-green-700 px-3 py-2 text-sm">
            ✅ Şifre sıfırlama e-postası gönderildi. Mail kutunu kontrol et!
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="email@ornek.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            required
          />

          <input
            type="password"
            placeholder="Şifre"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            required
          />

          {/* Şifremi unuttum */}
          <p
            onClick={handlePasswordReset}
            className="text-right text-sm text-blue-600 hover:underline cursor-pointer -mt-2"
          >
            Şifremi unuttum
          </p>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white rounded px-4 py-2 text-sm hover:bg-neutral-800 transition"
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </div>
    </div>
  );
}
