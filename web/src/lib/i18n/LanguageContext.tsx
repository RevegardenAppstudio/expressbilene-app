"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { translations, type Language } from "./translations";

const STORAGE_KEY = "eb_language";

function getNested(obj: unknown, path: string[]): string | undefined {
  let current: unknown = obj;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

function translate(language: Language, key: string, vars?: Record<string, string | number>): string {
  const path = key.split(".");
  const template = getNested(translations[language], path) ?? getNested(translations.no, path) ?? key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ""));
}

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: "no",
  setLanguage: () => {},
  t: (key, vars) => translate("no", key, vars),
});

export function LanguageProvider({
  initialLanguage,
  userId,
  children,
}: {
  initialLanguage: Language;
  userId?: string | null;
  children: React.ReactNode;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  // Uinnloggede besøkende har ingen profil å synke mot -- bruk et tidligere
  // valg lagret lokalt i nettleseren i stedet, hvis det finnes.
  useEffect(() => {
    if (userId) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "no" || stored === "en") setLanguageState(stored);
    } catch {
      // Lokal lagring utilgjengelig -- fortsetter med serverens standardspråk.
    }
  }, [userId]);

  const setLanguage = useCallback(
    (next: Language) => {
      setLanguageState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Lokal lagring utilgjengelig -- valget gjelder likevel resten av økten.
      }
      if (userId) {
        const supabase = createClient();
        supabase.from("profiles").update({ language: next }).eq("id", userId).then();
      }
    },
    [userId]
  );

  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(language, key, vars), [language]);

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
