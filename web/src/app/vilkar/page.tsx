"use client";

import { useRouter } from "next/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LanguageProvider, useLanguage } from "@/lib/i18n/LanguageContext";

function VilkarContent() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <div className="flex flex-1 justify-center px-4 py-12">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900">{t("vilkar.title")}</h1>
          <LanguageSwitcher />
        </div>
        <p className="mt-2 text-xs text-slate-400">{t("vilkar.lastUpdated")}</p>

        <div className="mt-6 space-y-6 text-sm leading-relaxed text-slate-600">
          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("vilkar.s1Title")}</h2>
            <p className="mt-2">{t("vilkar.s1Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("vilkar.s2Title")}</h2>
            <p className="mt-2">{t("vilkar.s2Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("vilkar.s3Title")}</h2>
            <p className="mt-2">{t("vilkar.s3Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("vilkar.s4Title")}</h2>
            <p className="mt-2">{t("vilkar.s4Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("vilkar.s5Title")}</h2>
            <p className="mt-2">{t("vilkar.s5Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("vilkar.s6Title")}</h2>
            <p className="mt-2">{t("vilkar.s6Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("vilkar.s7Title")}</h2>
            <p className="mt-2">{t("vilkar.s7Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("vilkar.s8Title")}</h2>
            <p className="mt-2">
              {t("vilkar.s8Before")}{" "}
              <a href="tel:41281000" className="text-brand-dark hover:brightness-90">
                412 81 000
              </a>
              {t("vilkar.s8After")}
            </p>
          </section>
        </div>

        <button
          type="button"
          onClick={() => router.back()}
          className="mt-8 inline-block text-sm font-medium text-brand-dark hover:text-brand-dark"
        >
          {t("vilkar.back")}
        </button>
      </div>
    </div>
  );
}

export default function VilkarPage() {
  return (
    <LanguageProvider initialLanguage="no" userId={null}>
      <VilkarContent />
    </LanguageProvider>
  );
}
