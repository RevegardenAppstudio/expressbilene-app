"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function Footer({
  variant = "dark",
  showLinks = true,
}: {
  variant?: "light" | "dark";
  showLinks?: boolean;
}) {
  const { t } = useLanguage();
  const year = new Date().getFullYear();
  const textClass = variant === "light" ? "text-slate-300" : "text-slate-400";
  const linkClass = variant === "light" ? "hover:text-white" : "hover:text-slate-600";

  return (
    <footer className={`px-4 py-4 text-center text-xs ${textClass}`}>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {showLinks && (
          <>
            <Link href="/vilkar" className={linkClass}>
              {t("footer.terms")}
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/personvern" className={linkClass}>
              {t("footer.privacy")}
            </Link>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>{t("footer.copyright", { year })}</span>
      </div>
    </footer>
  );
}
