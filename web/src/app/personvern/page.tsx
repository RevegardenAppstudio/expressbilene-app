"use client";

import { useRouter } from "next/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LanguageProvider, useLanguage } from "@/lib/i18n/LanguageContext";

function PersonvernContent() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <div className="flex flex-1 justify-center px-4 py-12">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900">{t("personvern.title")}</h1>
          <LanguageSwitcher />
        </div>
        <p className="mt-2 text-xs text-slate-400">{t("personvern.lastUpdated")}</p>

        <div className="mt-6 space-y-6 text-sm leading-relaxed text-slate-600">
          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("personvern.s1Title")}</h2>
            <p className="mt-2">
              {t("personvern.s1Before")}{" "}
              <a href="tel:41281000" className="text-brand-dark hover:brightness-90">
                412 81 000
              </a>
              {t("personvern.s1After")}
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("personvern.s2Title")}</h2>
            <p className="mt-2">{t("personvern.s2Intro")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{t("personvern.s2Item1")}</li>
              <li>{t("personvern.s2Item2")}</li>
              <li>{t("personvern.s2Item3")}</li>
              <li>{t("personvern.s2Item4")}</li>
              <li>{t("personvern.s2Item5")}</li>
            </ul>
            <p className="mt-3">{t("personvern.s2Note1")}</p>
            <p className="mt-3">{t("personvern.s2Note2")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("personvern.s3Title")}</h2>
            <p className="mt-2">{t("personvern.s3Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("personvern.s4Title")}</h2>
            <p className="mt-2">{t("personvern.s4Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("personvern.s5Title")}</h2>
            <p className="mt-2">{t("personvern.s5Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("personvern.s6Title")}</h2>
            <p className="mt-2">{t("personvern.s6Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("personvern.s7Title")}</h2>
            <p className="mt-2">{t("personvern.s7Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">{t("personvern.s8Title")}</h2>
            <p className="mt-2">{t("personvern.s8Body")}</p>
          </section>
        </div>

        <button
          type="button"
          onClick={() => router.back()}
          className="mt-8 inline-block text-sm font-medium text-brand-dark hover:text-brand-dark"
        >
          {t("personvern.back")}
        </button>
      </div>
    </div>
  );
}

export default function PersonvernPage() {
  return (
    <LanguageProvider initialLanguage="no" userId={null}>
      <PersonvernContent />
    </LanguageProvider>
  );
}
