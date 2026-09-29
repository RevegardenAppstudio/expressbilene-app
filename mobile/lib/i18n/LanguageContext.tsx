import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import { translations, type Language } from "./translations";

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
  language: profileLanguage,
  userId,
  children,
}: {
  language: Language;
  userId: string | null;
  children: React.ReactNode;
}) {
  const [override, setOverride] = useState<Language | null>(null);
  const language = override ?? profileLanguage;

  const setLanguage = useCallback(
    (next: Language) => {
      setOverride(next);
      if (userId) {
        supabase.from("profiles").update({ language: next }).eq("id", userId).then();
      }
    },
    [userId]
  );

  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(language, key, vars), [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
