"use client";

import Image from "next/image";
import Link from "next/link";
import Footer from "@/components/Footer";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function Homepage({ appHref }: { appHref?: string }) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Image src="/logo.png" alt="Expressbilene" width={2170} height={725} priority className="h-10 w-auto sm:h-12" />
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <LanguageSwitcher />
            <Link
              href={appHref ?? "/login"}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black transition-colors hover:brightness-90"
            >
              {appHref ? t("home.goToApp") : t("home.login")}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative flex min-h-[320px] items-center overflow-hidden sm:min-h-[400px]">
        <div className="absolute inset-0 -z-10 bg-slate-900">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/fleet-hero.avif)" }} />
          <div className="absolute inset-0 bg-black/60" />
        </div>
      </section>

      <section id="om-oss" className="bg-slate-50">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2">
          <div className="relative pb-8 pr-8 sm:pb-10 sm:pr-10">
            <div
              className="aspect-[4/3] rounded-xl bg-cover bg-center shadow-sm"
              style={{ backgroundImage: "url(/fleet-lineup.avif)" }}
            />
            <div
              className="absolute bottom-0 right-0 aspect-[4/3] w-1/2 rounded-xl border-4 border-slate-50 bg-cover bg-center shadow-lg"
              style={{ backgroundImage: "url(/fleet-van.avif)" }}
            />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t("home.aboutTitle")}</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">{t("home.aboutP1")}</p>

            <h2 id="kontakt" className="mt-10 text-2xl font-bold text-slate-900 sm:text-3xl">{t("home.contactTitle")}</h2>
            <a
              href="tel:41281000"
              className="mt-6 block text-2xl font-bold text-brand-dark hover:brightness-90"
            >
              412 81 000
            </a>
            <a
              href="mailto:post@expressbilene.no"
              className="mt-4 block text-lg font-semibold text-brand-dark hover:brightness-90"
            >
              post@expressbilene.no
            </a>
          </div>
        </div>
      </section>

      <Footer showLinks={false} />
    </div>
  );
}
