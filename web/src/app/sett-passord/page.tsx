"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Footer from "@/components/Footer";

export default function SettPassordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Passordet må være minst 8 tegn.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passordene er ikke like.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error, data } = await supabase.auth.updateUser({ password });

    if (error) {
      setLoading(false);
      setError("Kunne ikke sette passord. Prøv å be om en ny lenke.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    setLoading(false);
    router.push(profile?.role === "admin" ? "/sammendrag" : "/timer");
    router.refresh();
  }

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-500">Laster …</p>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-700">
            Denne lenken er ugyldig eller utløpt. Be om en ny invitasjon fra sjefen din, eller
            be om en ny tilbakestillingslenke.
          </p>
          <Link href="/glemt-passord" className="mt-4 inline-block text-sm font-medium text-brand-dark hover:text-brand-dark">
            Be om ny lenke
          </Link>
        </div>
      </div>
      <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-dark">Expressbilene</h1>
          <p className="mt-1 text-sm text-slate-500">Sett passord</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Nytt passord
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-700">
              Gjenta passord
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black transition-colors hover:brightness-90 disabled:opacity-60"
          >
            {loading ? "Lagrer …" : "Lagre passord"}
          </button>
        </form>
      </div>
    </div>
    <Footer />
    </div>
  );
}
