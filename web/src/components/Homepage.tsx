"use client";

import Image from "next/image";
import Link from "next/link";
import Footer from "@/components/Footer";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function Homepage({ appHref }: { appHref?: string }) {
  const { t } = useLanguage();

  const SERVICES = [
    { title: t("home.budbilerTitle"), text: t("home.budbilerText"), image: "/bakgrunn2.avif" },
    { title: t("home.varetransportTitle"), text: t("home.varetransportText"), image: "/bakgrunn1.avif" },
    { title: t("home.varetaxiTitle"), text: t("home.varetaxiText"), image: "/bakgrunn5.avif" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Image src="/logo.png" alt="Ekspressbilene" width={2170} height={725} priority className="h-10 w-auto sm:h-12" />
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <LanguageSwitcher />
            <Link
              href="/struktur"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 sm:px-4"
            >
              {t("home.struktur")}
            </Link>
            <Link
              href={appHref ?? "/login"}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black transition-colors hover:brightness-90"
            >
              {appHref ? t("home.goToApp") : t("home.login")}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative flex min-h-[480px] items-center overflow-hidden sm:min-h-[560px]">
        <div className="absolute inset-0 -z-10 bg-slate-900">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/bakgrunn4.avif)" }} />
          <div className="absolute inset-0 bg-black/60" />
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <p className="max-w-xl text-lg text-slate-200 sm:text-xl">{t("home.heroTagline")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#kontakt"
              className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:brightness-90"
            >
              {t("home.contactUs")}
            </a>
          </div>
        </div>
      </section>

      <section id="tjenester" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t("home.servicesTitle")}</h2>
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          {SERVICES.map((service) => (
            <div key={service.title} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div
                className="aspect-[16/9] bg-cover bg-center"
                style={{ backgroundImage: `url(${service.image})` }}
              />
              <div className="p-6">
                <div className="mb-3 h-1 w-10 rounded-full bg-brand" />
                <h3 className="text-lg font-semibold text-slate-900">{service.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{service.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="om-oss" className="bg-slate-50">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2">
          <div
            className="aspect-[4/3] rounded-xl bg-cover bg-center shadow-sm"
            style={{ backgroundImage: "url(/bakgrunn3.avif)" }}
          />
          <div>
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t("home.aboutTitle")}</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">{t("home.aboutP1")}</p>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">{t("home.aboutP2")}</p>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">{t("home.aboutP3")}</p>
            <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
              <div>
                <p className="text-xl font-bold text-brand-dark sm:text-2xl">2012</p>
                <p className="text-xs text-slate-500">{t("home.establishedLabel")}</p>
              </div>
              <div>
                <p className="text-xl font-bold text-brand-dark sm:text-2xl">100+</p>
                <p className="text-xs text-slate-500">{t("home.vehiclesLabel")}</p>
              </div>
              <div>
                <p className="text-xl font-bold text-brand-dark sm:text-2xl">{t("home.nationwide")}</p>
                <p className="text-xs text-slate-500">{t("home.nationwideLabel")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="kontakt" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-lg">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t("home.contactTitle")}</h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">{t("home.contactText")}</p>
          <a
            href="tel:41281000"
            className="mt-6 block text-2xl font-bold text-brand-dark hover:brightness-90"
          >
            412 81 000
          </a>
          <p className="mt-1 text-sm text-slate-500">{t("home.contactHours")}</p>
        </div>
      </section>

      <Footer showLinks={false} />
    </div>
  );
}
