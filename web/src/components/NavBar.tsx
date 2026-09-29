"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { Profile } from "@/lib/types";

export default function NavBar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [unread, setUnread] = useState(0);
  const isStaff = profile.role === "admin" || profile.role === "moderator";

  const DRIVER_ONLY_LINKS = [
    { href: "/timer", label: t("nav.timer") },
    { href: "/fravaer", label: t("nav.fravaer") },
    { href: "/hendelser", label: t("nav.hendelser") },
  ];
  const COMMON_LINKS = [{ href: "/sammendrag", label: t("nav.oversikt") }];
  const STAFF_LINKS = [
    { href: "/kalender", label: t("nav.kalender") },
    { href: "/admin/avdelinger", label: t("nav.avdelinger") },
  ];
  const roleLabel =
    profile.role === "admin" ? t("nav.roleAdmin") : profile.role === "moderator" ? t("nav.roleModerator") : t("nav.roleSjafor");

  useEffect(() => {
    if (!isStaff) return;
    // Varslersiden selv setter notifications_viewed_at til "nå" med det
    // samme den åpnes -- profile-proppen kommer fra layouten (server-side,
    // hentet én gang) og oppdateres derfor ikke av det. Nulles derfor
    // optimistisk med en gang man er på /varsler, og hentes ellers på nytt
    // (med fersk notifications_viewed_at fra databasen) ved hver navigasjon.
    if (pathname === "/varsler") {
      setUnread(0);
      return;
    }
    const supabase = createClient();
    (async () => {
      const { data: freshProfile } = await supabase
        .from("profiles")
        .select("notifications_viewed_at")
        .eq("id", profile.id)
        .single();
      const viewedAt = freshProfile?.notifications_viewed_at ?? profile.notifications_viewed_at ?? "1970-01-01";
      const { data } = await supabase.from("notifications").select("id, created_at", { count: "exact" }).gt("created_at", viewedAt);
      setUnread(data?.length ?? 0);
    })();
  }, [isStaff, pathname, profile.id, profile.notifications_viewed_at]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem("eb_remember");
    sessionStorage.removeItem("eb_alive");
    router.push("/login");
    router.refresh();
  }

  const links = [
    ...(profile.role === "admin" ? [] : DRIVER_ONLY_LINKS),
    ...COMMON_LINKS,
    ...(isStaff ? STAFF_LINKS : []),
  ];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Image src="/logo.png" alt="Expressbilene" width={2170} height={725} priority className="h-10 w-auto sm:h-12" />
          </Link>
          <span className="sm:hidden text-xs text-slate-500">{profile.full_name}</span>
        </div>

        <nav className="flex flex-wrap gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-brand text-black" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          {isStaff && (
            <Link
              href="/varsler"
              className={`relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === "/varsler" ? "bg-brand text-black" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t("nav.varsler")}
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </Link>
          )}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          <span className="text-sm text-slate-500">
            {profile.full_name} · {roleLabel}
          </span>
          <LanguageSwitcher />
          <button
            onClick={handleLogout}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            {t("common.logout")}
          </button>
        </div>
        <div className="flex items-center gap-2 sm:hidden">
          <LanguageSwitcher />
          <button
            onClick={handleLogout}
            className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            {t("common.logout")}
          </button>
        </div>
      </div>
    </header>
  );
}
