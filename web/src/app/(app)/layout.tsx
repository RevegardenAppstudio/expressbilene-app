import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import { ToastProvider } from "@/components/Toast";
import SessionGuard from "@/components/SessionGuard";
import Footer from "@/components/Footer";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import type { Profile } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, department_id, notifications_viewed_at, terms_accepted_at, language, created_at")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) {
    redirect("/login");
  }

  if (!profile.terms_accepted_at) {
    redirect("/godta-vilkar");
  }

  return (
    <LanguageProvider initialLanguage={profile.language} userId={profile.id}>
      <ToastProvider>
        <SessionGuard />
        <div className="flex min-h-screen flex-1 flex-col">
          <NavBar profile={profile} />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</main>
          <Footer />
        </div>
      </ToastProvider>
    </LanguageProvider>
  );
}
