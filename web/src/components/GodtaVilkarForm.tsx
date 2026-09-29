"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { UserRole } from "@/lib/types";

export default function GodtaVilkarForm({ userId, role }: { userId: string; role: UserRole }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      setLoading(false);
      setError(t("godtaVilkar.genericError"));
      return;
    }

    router.push(role === "admin" ? "/sammendrag" : "/timer");
    router.refresh();
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem("eb_remember");
    sessionStorage.removeItem("eb_alive");
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <Image src="/logo.png" alt="Ekspressbilene" width={2170} height={725} priority className="mx-auto h-12 w-auto sm:h-14" />
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{t("godtaVilkar.heading")}</h1>
        <p className="text-sm text-slate-600">{t("godtaVilkar.intro")}</p>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
          <span>
            {t("godtaVilkar.agreePrefix")}{" "}
            <Link href="/vilkar" target="_blank" className="font-medium text-brand-dark hover:brightness-90">
              {t("godtaVilkar.termsLink")}
            </Link>{" "}
            {t("godtaVilkar.and")}{" "}
            <Link href="/personvern" target="_blank" className="font-medium text-brand-dark hover:brightness-90">
              {t("godtaVilkar.privacyLink")}
            </Link>
            .
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!checked || loading}
          className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black transition-colors hover:brightness-90 disabled:opacity-60"
        >
          {loading ? t("common.saving") : t("godtaVilkar.continue")}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
        >
          {t("godtaVilkar.logoutInstead")}
        </button>
      </div>
    </div>
  );
}
