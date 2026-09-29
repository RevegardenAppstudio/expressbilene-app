"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function LanguageSwitcher({ variant = "dark" }: { variant?: "light" | "dark" }) {
  const { language, setLanguage } = useLanguage();
  const isLight = variant === "light";

  return (
    <div
      className={`flex items-center gap-0.5 rounded-md border p-0.5 ${
        isLight ? "border-white/30 bg-white/10" : "border-slate-300"
      }`}
    >
      <button
        type="button"
        onClick={() => setLanguage("no")}
        aria-label="Norsk"
        aria-pressed={language === "no"}
        className={`rounded px-1.5 py-1 text-base leading-none transition-colors ${
          language === "no" ? (isLight ? "bg-white/25" : "bg-slate-200") : "opacity-50 hover:opacity-80"
        }`}
      >
        🇳🇴
      </button>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        aria-label="English"
        aria-pressed={language === "en"}
        className={`rounded px-1.5 py-1 text-base leading-none transition-colors ${
          language === "en" ? (isLight ? "bg-white/25" : "bg-slate-200") : "opacity-50 hover:opacity-80"
        }`}
      >
        🇬🇧
      </button>
    </div>
  );
}
