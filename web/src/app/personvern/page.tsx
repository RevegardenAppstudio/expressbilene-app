import Link from "next/link";

export default function PersonvernPage() {
  return (
    <div className="flex flex-1 justify-center px-4 py-12">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-2xl font-bold text-slate-900">Personvernerklæring</h1>
        <p className="mt-2 text-xs text-slate-400">Sist oppdatert: 29. september 2026</p>

        <div className="mt-6 space-y-6 text-sm leading-relaxed text-slate-600">
          <section>
            <h2 className="text-base font-semibold text-slate-900">1. Behandlingsansvarlig</h2>
            <p className="mt-2">
              Expressbilene (org.nr. 920 917 658), Stangnesterminalen 8 A, 9409 Harstad, er
              behandlingsansvarlig for personopplysningene som behandles i dette systemet og
              gjennom kontaktskjemaet på nettsiden. Du kan nå oss på telefon{" "}
              <a href="tel:41281000" className="text-brand-dark hover:brightness-90">
                412 81 000
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">2. Hvilke opplysninger vi behandler</h2>
            <p className="mt-2">For ansatte som bruker systemet, behandler vi:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Navn, e-postadresse, rolle og avdeling</li>
              <li>Registrert arbeidstid (inn- og utstempling), rute og kjøretøy</li>
              <li>Fravær og ferie, inkludert kategori ved sykefravær (egenmelding/sykemelding/sykt barn)</li>
              <li>Hendelser knyttet til kjøretøy (f.eks. utforkjøring, verksted/service)</li>
              <li>Endringslogg over hvem som har registrert eller endret hva, og når</li>
            </ul>
            <p className="mt-3">
              Sykefraværskategori regnes som en særlig kategori personopplysninger (helseopplysning)
              etter personvernforordningen. Vi registrerer kun kategorien — ikke diagnose eller
              annen helseinformasjon.
            </p>
            <p className="mt-3">
              Fra kontaktskjemaet på nettsiden behandler vi navn, e-postadresse og meldingen du
              skriver. Skjemaet åpner din egen e-postklient og sender meldingen direkte derfra — vi
              lagrer ikke innholdet på våre servere.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">3. Formål og behandlingsgrunnlag</h2>
            <p className="mt-2">
              Opplysningene brukes til å administrere arbeidsforholdet: timeføring, fraværsoppfølging
              og bemanning av kjøretøy. Behandlingsgrunnlaget er oppfyllelse av arbeidsavtalen og
              lovpålagte plikter som arbeidsgiver (blant annet knyttet til arbeidstid og
              sykefraværsoppfølging). Sykefraværskategori behandles med grunnlag i
              personvernforordningen artikkel 9 nr. 2 bokstav b, som gjelder arbeidsrettslige
              forpliktelser.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">4. Hvem har tilgang</h2>
            <p className="mt-2">
              Administratorer og ledere med moderator-rolle har tilgang til alle ansatte, på tvers
              av avdelinger. Opplysningene deles ikke med uvedkommende utenfor Expressbilene.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">5. Databehandlere</h2>
            <p className="mt-2">
              Systemet driftes med Supabase (database og innlogging, lagret innenfor EU/EØS) og
              Vercel (drift av nettsiden). Disse leverandørene behandler opplysninger på våre vegne
              i tråd med databehandleravtale.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">6. Lagringstid</h2>
            <p className="mt-2">
              Opplysningene lagres så lenge ansettelsesforholdet varer, og deretter så lenge det er
              nødvendig for å oppfylle lovpålagte plikter (for eksempel regnskapsregler for
              timeregistreringer). Deretter slettes eller anonymiseres opplysningene.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">7. Dine rettigheter</h2>
            <p className="mt-2">
              Du har rett til innsyn i, retting og sletting av egne opplysninger, samt rett til å be
              om begrensning av behandlingen. Ta kontakt med oss for å benytte disse rettighetene. Du
              kan også klage til Datatilsynet.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900">8. Sikkerhet</h2>
            <p className="mt-2">
              All trafikk til systemet er kryptert (HTTPS), og tilgang til opplysninger er
              rollestyrt slik at hver bruker kun ser det som er relevant for egen rolle og avdeling.
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
