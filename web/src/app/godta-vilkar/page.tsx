import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Footer from "@/components/Footer";
import GodtaVilkarForm from "@/components/GodtaVilkarForm";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import type { Profile } from "@/lib/types";

export default async function GodtaVilkarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, terms_accepted_at, language")
    .eq("id", user.id)
    .single<Pick<Profile, "id" | "role" | "terms_accepted_at" | "language">>();

  if (!profile) {
    redirect("/login");
  }

  if (profile.terms_accepted_at) {
    redirect(profile.role === "admin" ? "/sammendrag" : "/timer");
  }

  return (
    <LanguageProvider initialLanguage={profile.language} userId={profile.id}>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center px-4 py-12">
          <GodtaVilkarForm userId={profile.id} role={profile.role} />
        </div>
        <Footer />
      </div>
    </LanguageProvider>
  );
}
