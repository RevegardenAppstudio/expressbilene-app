"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Footer from "@/components/Footer";

export default function GlemtPassordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/sett-passord`,
    });

    setLoading(false);

    if (error) {
      setError("Noe gikk galt. Prøv igjen.");
      return;
    }

    setSent(true);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-dark">Ekspressbilene</h1>
          <p className="mt-1 text-sm text-slate-500">Tilbakestill passord</p>
        </div>

        {sent ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-700">
              Hvis <span className="font-medium">{email}</span> er registrert hos oss, har vi
              sendt en e-post med lenke for å sette nytt passord.
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm font-medium text-brand-dark hover:text-brand-dark">
              Tilbake til innlogging
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                E-post
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black transition-colors hover:brightness-90 disabled:opacity-60"
            >
              {loading ? "Sender …" : "Send tilbakestillingslenke"}
            </button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-slate-500 hover:text-brand-dark">
                Tilbake til innlogging
              </Link>
            </div>
          </form>
        )}
      </div>
      </div>

      <Footer />
    </div>
  );
}
