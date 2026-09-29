"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Supabase sin nettleser-klient setter alltid en 400 dagers levetid på
// sesjonscookien, uansett hva vi ber om (biblioteket overstyrer maxAge internt).
// Derfor kan vi ikke korte ned selve cookien når "husk meg" er avslått.
// I stedet bruker vi sessionStorage (tømmes når nettleseren lukkes) som bevis
// på at denne fanen/vinduet har vært aktivt siden innlogging. Mangler beviset
// samtidig som forrige valg var "ikke husk meg", betyr det at nettleseren har
// vært lukket og gjenåpnet -- da logger vi ut.
export default function SessionGuard() {
  const router = useRouter();

  useEffect(() => {
    const remembered = localStorage.getItem("eb_remember");
    const alive = sessionStorage.getItem("eb_alive");

    if (remembered === "0" && alive !== "1") {
      const supabase = createClient();
      supabase.auth.signOut().then(() => {
        router.push("/login");
        router.refresh();
      });
      return;
    }

    sessionStorage.setItem("eb_alive", "1");
  }, [router]);

  return null;
}
