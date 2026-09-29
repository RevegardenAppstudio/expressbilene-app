import Link from "next/link";

export default function VilkarPage() {
  return (
    <div className="flex flex-1 justify-center px-4 py-12">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-2xl font-bold text-slate-900">Vilkår for bruk</h1>
        <p className="mt-2 text-xs text-slate-400">Sist oppdatert: 27. september 2026</p>

        <div className="mt-6 space-y-6 text-sm leading-relaxed text-slate-600">
          <section>
            <h2 className="text-base font-semibold text-slate-900">1. Om systemet</h2>
            <p className="mt-2">
              Dette systemet er et internt verktøy for Ekspressbilene, brukt av ansatte til å
              registrere arbeidstid, fravær og kjøretøybruk, og av ledere/administratorer til å
              følge opp bemanning og kjøretøypark. Systemet er ikke en offentlig tjeneste, og
              tilgang forutsetter en brukerkonto opprettet av Ekspressbilene.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">2. Brukerkonto</h2>
            <p className="mt-2">
              Brukerkontoen din opprettes av en administrator hos Ekspressbilene, og er personlig.
              Du er ansvarlig for å holde passordet ditt hemmelig og for aktivitet som skjer på din
              konto. Oppdager du at noen andre kan ha fått tilgang til kontoen din, må du bytte
              passord og varsle nærmeste leder umiddelbart.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">3. Riktig bruk</h2>
            <p className="mt-2">
              Systemet skal kun brukes til arbeidsrelaterte formål: registrering av egen arbeidstid,
              fravær og kjøretøybruk, samt oppfølging av dette der du har en lederrolle. Du er
              ansvarlig for at opplysningene du registrerer er korrekte. Ledere og administratorer
              kan rette eller supplere registreringer for ansatte i egen avdeling — slike endringer
              logges.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">4. Tjenester (transport og bilutleie)</h2>
            <p className="mt-2">
              Nettsiden gir generell informasjon om Ekspressbilenes tjenester innen budbil,
              varetransport og varetaxi. Vi tar ikke imot bestillinger fra privatkunder. Konkrete
              transportoppdrag avtales direkte med kunden, og reguleres av egen avtale eller
              oppdragsbekreftelse, ikke av disse vilkårene.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">5. Ansvar</h2>
            <p className="mt-2">
              Ekspressbilene tilstreber at systemet er tilgjengelig og fungerer som forventet, men
              gir ingen garanti mot driftsavbrudd. Ekspressbilene er ikke ansvarlig for tap som
              følge av feilregistreringer gjort av brukeren selv.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">6. Endringer</h2>
            <p className="mt-2">
              Vi kan oppdatere disse vilkårene ved behov, for eksempel når systemet får ny
              funksjonalitet. Vesentlige endringer vil bli varslet til ansatte gjennom systemet.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">7. Lovvalg</h2>
            <p className="mt-2">Norsk lov gjelder for bruk av dette systemet.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">8. Kontakt</h2>
            <p className="mt-2">
              Spørsmål om vilkårene rettes til Ekspressbilene (org.nr. 920 917 658),
              Stangnesterminalen 8 A, 9409 Harstad, på telefon{" "}
              <a href="tel:41281000" className="text-brand-dark hover:brightness-90">
                412 81 000
              </a>
              .
            </p>
          </section>
        </div>

        <Link href="/login" className="mt-8 inline-block text-sm font-medium text-brand-dark hover:text-brand-dark">
          Tilbake til innlogging
        </Link>
      </div>
    </div>
  );
}
