import Image from "next/image";
import Link from "next/link";
import Footer from "@/components/Footer";

const GRUPPEN = { name: "Expressbilene Gruppen", image: "/struktur-gruppen.avif", width: 402, height: 90 };
const TRANSPORT = { name: "Expressbilene Transport", image: "/struktur-transport.avif", width: 279, height: 61 };
const TRANSPORTSERVICE = { name: "Transportservice Harstad", image: "/struktur-transportservice-harstad.avif", width: 338, height: 62 };
const BILUTLEIE = { name: "Expressbilene Bilutleie", image: "/struktur-bilutleie.avif", width: 279, height: 62 };
const GH_UTLEIE = { name: "GH Utleie", image: "/struktur-gh-utleie.avif", width: 279, height: 62 };

function StrukturCard({ company }: { company: { name: string; image: string; width: number; height: number } }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <Image
        src={company.image}
        alt={company.name}
        width={company.width}
        height={company.height}
        className="h-8 w-auto sm:h-9"
      />
    </div>
  );
}

export default function StrukturPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/">
            <Image src="/logo.png" alt="Expressbilene" width={2170} height={725} priority className="h-10 w-auto sm:h-12" />
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black transition-colors hover:brightness-90"
          >
            Logg inn
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6">
        <Link href="/" className="text-sm text-slate-500 hover:text-brand-dark">
          ← Tilbake til hjemmesiden
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-slate-900 sm:text-3xl">Vår struktur</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600">
          Expressbilene er en del av et større nettverk, bestående av fem ulike selskaper.
        </p>

        <div className="mt-10 flex flex-col items-center">
          <div className="w-full max-w-xs">
            <StrukturCard company={GRUPPEN} />
          </div>

          <div className="h-8 w-px bg-slate-300" />

          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-6">
            <div className="w-48">
              <StrukturCard company={TRANSPORT} />
            </div>
            <div className="w-48">
              <StrukturCard company={TRANSPORTSERVICE} />
            </div>
            <div className="flex w-48 flex-col items-center">
              <StrukturCard company={BILUTLEIE} />
              <div className="h-6 w-px bg-slate-300" />
              <StrukturCard company={GH_UTLEIE} />
            </div>
          </div>
        </div>
      </div>

      <Footer showLinks={false} />
    </div>
  );
}
