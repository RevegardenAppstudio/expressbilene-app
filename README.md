# Expressbilene

App for timeføring, fravær (sykdom/ferie/permisjon) og bemanning for
Expressbilene. Består av to apper som deler samme Supabase-backend:

- **`web/`** — Next.js-nettapp. Brukes av alle ansatte til timeføring og
  fravær, og av admin/sjef til å se oversikt, godkjenne fravær og
  administrere ansatte.
- **`mobile/`** — Expo (React Native)-app for ansatte. Samme kjernefunksjoner
  som nettappen (timer, fravær, kalender), for bruk på telefon.

## Arkitektur

- **Supabase** (Postgres + Auth + Edge Functions) er eneste backend. Se
  [`supabase/schema.sql`](supabase/schema.sql) for hele databasemodellen.
- **Row Level Security** håndhever alle tilgangsregler i databasen — en
  ansatt kan kun opprette/endre sine egne timer og fraværssøknader,
  og kan ikke gi seg selv admin-rolle. Dette gjelder uansett hva klienten
  gjør, så det kan ikke omgås fra appen.
- **Roller**: `sjafor` (vanlig ansatt), `moderator` og `admin`, lagret i
  `profiles.role`. Moderator har samme tilgang som admin til å administrere
  ansatte, ruter og biler, og til å godkjenne fravær — på tvers av alle
  avdelinger, ikke bare egen. Kun admin kan invitere/redigere/slette
  brukere, deaktivere kontoer og se endringsloggen. Den aller første
  brukeren som opprettes (via `/oppsett` i nettappen) blir automatisk admin.
  Alle senere ansatte legges til av en admin via invitasjon.
- **Brukeradministrasjon** skjer via Supabase Edge Functions
  (`supabase/functions/`) som bruker secret key server-side:
  - `invite-user` — admin inviterer en ny ansatt på e-post
  - `admin-list-users` — admin/moderator ser status (aktiv/invitert) på alle ansatte
  - `admin-update-user` — admin endrer navn/rolle/avdeling på en ansatt
  - `admin-delete-user` — admin fjerner en ansattkonto
  - `notify-staff-push` — sender push-varsel til admin/moderator på mobil
    (filtrert på den enkeltes varslingsinnstillinger, se `/innstillinger`)

## Kom i gang

Databasen og Edge Functions er allerede satt opp i Supabase-prosjektet
**Expressbilene** (`djjsinnboucpavbkdwrg`, eu-north-1).

### Nettapp

```bash
cd web
npm install
npm run dev
```

Åpne http://localhost:3000/oppsett **kun første gang** for å opprette
admin-kontoen (siden slutter å virke så snart én bruker finnes). Deretter
logger admin inn på vanlig måte på `/login` og inviterer resten av teamet
under «Ansatte».

Miljøvariabler ligger allerede i `web/.env.local`.

### Mobilapp

```bash
cd mobile
npm install
npx expo start
```

Skann QR-koden med Expo Go, eller trykk `i`/`a` for simulator. Ansatte
logger inn med samme e-post/passord som de satte via invitasjonslenken
(som åpnes i nettappen). Miljøvariabler ligger i `mobile/.env`.

## Viktig: Supabase-innstillinger som må sjekkes

I [Supabase Dashboard](https://supabase.com/dashboard/project/djjsinnboucpavbkdwrg):

1. **Authentication → URL Configuration** — legg til redirect-URL-ene som
   skal kunne motta invitasjons-/tilbakestillingslenker:
   - `http://localhost:3000/sett-passord` (lokal utvikling)
   - `https://<produksjonsdomene>/sett-passord` (når nettappen er driftsatt)
2. **Authentication → Emails** — standard e-postmaler er på engelsk; vurder
   å oversette invitasjons- og tilbakestillingsmalene til norsk.
3. **Project Settings → Custom SMTP** — Supabase sin innebygde e-postsender
   har lave grenser (kun til testing). Sett opp egen SMTP (f.eks. via
   bedriftens e-postleverandør) før dere inviterer mange ansatte.

## Neste steg (ikke bygget ennå)

- App store-publisering av mobilappen — EAS-prosjektet er satt opp
  (`mobile/app.json`), men det er ikke laget/sendt inn noen produksjonsbuild
  ennå (se `npx eas build`). Frem til da brukes appen via Expo Go.
- Egen SMTP i Supabase (se punktet under) og eventuelt eget
  produksjonsdomene for nettappen — kjører p.t. på Vercels standarddomene.
- CSV-eksport av timelister (PDF-eksport for lønnskjøring finnes allerede,
  se `web/src/lib/reports.ts`).

Allerede bygget siden forrige gang denne lista ble skrevet: push-varsler i
mobilappen (med av/på-brytere per varslingstype), redigering av egne
timeregistreringer, og produksjonsutrulling av nettappen på Vercel.
