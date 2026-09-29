import { createClient } from "@/lib/supabase/server";
import Homepage from "@/components/Homepage";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <LanguageProvider initialLanguage="no" userId={null}>
        <Homepage />
      </LanguageProvider>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("role, language").eq("id", user.id).single();
  return (
    <LanguageProvider initialLanguage={profile?.language ?? "no"} userId={user.id}>
      <Homepage appHref={profile?.role === "admin" ? "/sammendrag" : "/timer"} />
    </LanguageProvider>
  );
}
