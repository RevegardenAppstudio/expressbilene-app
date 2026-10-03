"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LanguageProvider, useLanguage } from "@/lib/i18n/LanguageContext";

type Release = { version_name: string; version_code: number; apk_path: string; notes: string | null; created_at: string };

function LastNedContent() {
  const { t } = useLanguage();
  const [release, setRelease] = useState<Release | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("app_releases")
        .select("version_name, version_code, apk_path, notes, created_at")
        .eq("platform", "android")
        .order("version_code", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setRelease(data as Release);
        setDownloadUrl(supabase.storage.from("app-releases").getPublicUrl(data.apk_path).data.publicUrl);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex flex-1 justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900">{t("lastNed.title")}</h1>
          <LanguageSwitcher />
        </div>
        <p className="mt-2 text-sm text-slate-500">{t("lastNed.subtitle")}</p>

        <div className="mt-6">
          {loading ? (
            <p className="text-sm text-slate-400">{t("common.loading")}</p>
          ) : !release || !downloadUrl ? (
            <p className="text-sm text-slate-500">{t("lastNed.noRelease")}</p>
          ) : (
            <>
              <a
                href={downloadUrl}
                className="block w-full rounded-md bg-brand px-4 py-3 text-center text-sm font-semibold text-black hover:brightness-90"
              >
                {t("lastNed.download", { version: release.version_name })}
              </a>
              {release.notes && <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{release.notes}</p>}
            </>
          )}
        </div>

        <div className="mt-8 space-y-2 text-sm text-slate-600">
          <h2 className="text-base font-semibold text-slate-900">{t("lastNed.howTitle")}</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>{t("lastNed.step1")}</li>
            <li>{t("lastNed.step2")}</li>
            <li>{t("lastNed.step3")}</li>
            <li>{t("lastNed.step4")}</li>
          </ol>
          <p className="pt-2 text-xs text-slate-400">{t("lastNed.updatesHint")}</p>
        </div>

        <Link href="/login" className="mt-8 inline-block text-sm font-medium text-brand-dark hover:brightness-90">
          {t("lastNed.toWeb")}
        </Link>
      </div>
    </div>
  );
}

export default function LastNedPage() {
  return (
    <LanguageProvider initialLanguage="no" userId={null}>
      <LastNedContent />
    </LanguageProvider>
  );
}
