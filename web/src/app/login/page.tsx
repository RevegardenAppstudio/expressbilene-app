"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import Footer from "@/components/Footer";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LanguageProvider, useLanguage } from "@/lib/i18n/LanguageContext";

function LoginForm() {
  const { t } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      setError(t("login.invalidCredentialsError"));
      return;
    }

    // "Husk meg" av: sesjonen skal ikke overleve at nettleseren lukkes.
    // sessionStorage tømmes automatisk når nettleseren lukkes, mens
    // localStorage-valget må ligge igjen slik at SessionGuard kan gjenkjenne
    // en gjenåpnet, ikke-husket sesjon og logge ut da (se SessionGuard.tsx).
    localStorage.setItem("eb_remember", rememberMe ? "1" : "0");
    sessionStorage.setItem("eb_alive", "1");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    setLoading(false);
    router.push(profile?.role === "admin" ? "/sammendrag" : "/timer");
    router.refresh();
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-slate-900">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/fleet-single.avif)" }} />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <Link
        href="/"
        className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:bg-white/20"
      >
        {t("login.homeLink")}
      </Link>
      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitcher variant="light" />
      </div>

      <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image src="/logo-white.png" alt="Expressbilene" width={2170} height={725} priority className="mx-auto h-12 w-auto sm:h-14" />
          <p className="mt-3 text-sm text-slate-200">{t("login.subtitle")}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-white/25 bg-white/10 p-6 shadow-lg backdrop-blur-md"
        >
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-white">
              {t("login.email")}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-white/30 bg-white/90 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-white">
              {t("login.password")}
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-white/30 bg-white/90 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-white/40 text-brand focus:ring-brand"
            />
            {t("login.rememberMe")}
          </label>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black transition-colors hover:brightness-90 disabled:opacity-60"
          >
            {loading ? t("login.loggingIn") : t("login.login")}
          </button>

          <div className="text-center">
            <Link href="/glemt-passord" className="text-sm text-white/80 hover:text-white">
              {t("login.forgotPassword")}
            </Link>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-slate-300">
          {t("login.newEmployeeHint")}
        </p>
      </div>
      </div>

      <Footer variant="light" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <LanguageProvider initialLanguage="no" userId={null}>
      <LoginForm />
    </LanguageProvider>
  );
}
