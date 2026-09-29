-- Expressbilene — Supabase-skjema (fullstendig, gjenspeiler deployet database)
-- Kjør i Supabase Dashboard -> SQL Editor -> New query -> Run (mot et NYTT
-- prosjekt).

-- ============================================================
-- 1. Roller og profiler
-- ============================================================
create type public.user_role as enum ('admin', 'moderator', 'sjafor');

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null default 'sjafor',
  department_id uuid references public.departments(id) on delete set null,
  notifications_viewed_at timestamptz,
  vacation_days_per_year integer not null default 25,
  -- Satt av admin via "Deaktiver"-knappen i Avdelinger. Blokkerer innlogging
  -- (auth.admin ban) med det samme. Kontoer som har stått deaktivert i over
  -- 1 år slettes automatisk, se delete_expired_deactivated_users() nedenfor.
  deactivated_at timestamptz,
  -- Satt når brukeren har godtatt vilkår/personvern (se /godta-vilkar). NULL
  -- til brukeren har godtatt -- (app)/layout.tsx tvinger da dit før resten
  -- av appen kan brukes.
  terms_accepted_at timestamptz,
  -- Brukerens foretrukne visningsspråk. Lagres per bruker (ikke per enhet)
  -- slik at valget synkes mellom nettsiden og mobilappen.
  language text not null default 'no' check (language in ('no', 'en')),
  created_at timestamptz not null default now()
);

alter table public.departments enable row level security;
alter table public.profiles enable row level security;

-- is_admin(): ren brukeradministrasjon (kun admin -- oppretter/endrer/sletter
-- brukere, avdelinger, ruter, biler, leser endringslogg).
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- is_staff(): admin ELLER moderator (brukes kun der begge skal likebehandles
-- uavhengig av avdeling -- de fleste steder brukes can_manage_user i stedet).
create or replace function public.is_staff()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'moderator'));
$$;

-- can_manage_user(target): true for admin uansett, og true for ENHVER
-- moderator uansett avdeling (moderator ser/administrerer på tvers av alle
-- avdelinger -- kun ansatte/biler/ruter-CRUD, deaktivering og
-- ferie/permisjon/sykemelding/fri er fortsatt is_admin()-only andre steder).
-- target_user_id brukes ikke lenger til noe avdelings-sjekk, men beholdes i
-- signaturen for kompatibilitet med eksisterende kallere.
create or replace function public.can_manage_user(target_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    public.is_admin()
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'moderator');
$$;

-- can_manage_department(): samme mønster som can_manage_user, men for
-- avdelings-nivå handlinger (f.eks. innstille en rute) som ikke er knyttet
-- til en spesifikk bruker.
create or replace function public.can_manage_department(target_department_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    public.is_admin()
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'moderator');
$$;

create policy "Innloggede kan lese avdelinger" on public.departments for select to authenticated using (true);
create policy "Admin kan administrere avdelinger" on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Innloggede kan lese alle profiler" on public.profiles for select to authenticated using (true);
create policy "Bruker kan endre eget navn" on public.profiles for update to authenticated using (auth.uid() = id);

-- Kun Edge Function (service_role) kan endre rolle/avdeling for ANDRE --
-- hindrer selv-opprykk.
create or replace function public.prevent_role_self_escalation()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.role() <> 'service_role' then
    raise exception 'Kun admin-verktøy kan endre rolle';
  end if;
  return new;
end;
$$;
create trigger trg_prevent_role_self_escalation before update on public.profiles
  for each row execute procedure public.prevent_role_self_escalation();

-- Den aller første brukeren (via /oppsett) blir automatisk admin. Alle andre
-- kommer inn via invitasjon (invite-user Edge Function), som setter
-- rolle/avdeling i metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
begin
  select not exists(select 1 from public.profiles) into is_first;
  insert into public.profiles (id, email, full_name, role, department_id)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when is_first then 'admin'::public.user_role
         else coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'sjafor') end,
    nullif(new.raw_user_meta_data->>'department_id', '')::uuid
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Lar den ubeskyttede /oppsett-siden sjekke (uten å være innlogget) om
-- systemet er helt tomt ennå. Lekker ingen data -- kun en boolean.
create or replace function public.is_first_time_setup()
returns boolean language sql security definer set search_path = public stable as $$
  select not exists(select 1 from public.profiles);
$$;
grant execute on function public.is_first_time_setup() to anon, authenticated;

-- ============================================================
-- 2. Ruter og biler (begge knyttet til avdeling, valgfritt)
-- ============================================================
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.routes enable row level security;
create policy "Innloggede kan lese ruter" on public.routes for select to authenticated using (true);
create policy "Admin kan administrere ruter" on public.routes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create index if not exists routes_department_idx on public.routes(department_id);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  name text not null, -- registreringsnummer
  make text, -- merke, f.eks. "Scania" -- valgfritt, vises som "{make} - {name}"
  created_at timestamptz not null default now()
);
alter table public.vehicles enable row level security;
create policy "Innloggede kan lese biler" on public.vehicles for select to authenticated using (true);
create policy "Admin kan administrere biler" on public.vehicles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create index if not exists vehicles_department_idx on public.vehicles(department_id);

-- Planlagt service/verksted for en bil (f.eks. "Service bestilt 30.10") -- vises
-- pa bilkortet og i kalenderen. Alle innloggede leser; admin/moderator
-- (uansett avdeling) administrerer -- operasjonell oppgave i likhet med å
-- innstille ruter (can_manage_department), ikke en strukturell bil-endring
-- (som fortsatt er is_admin()-only, se vehicles over).
create table if not exists public.vehicle_service_bookings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  service_date date not null,
  service_time time, -- valgfritt klokkeslett -- vises pa bilkortet og i klokke-inn-varselet, ikke i kalenderen
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.vehicle_service_bookings enable row level security;
create policy "Innloggede kan lese verkstedbookinger" on public.vehicle_service_bookings for select to authenticated using (true);
create policy "Admin/moderator kan administrere verkstedbookinger" on public.vehicle_service_bookings for all to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.can_manage_department(v.department_id)))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.can_manage_department(v.department_id)));
create index if not exists vehicle_service_bookings_vehicle_idx on public.vehicle_service_bookings(vehicle_id);
create index if not exists vehicle_service_bookings_date_idx on public.vehicle_service_bookings(service_date);

-- Innstilte ruter (f.eks. pga vær/brudd) -- rent informativt i kalenderen,
-- ingen effekt på lønn/timeregistrering. Admin/moderator (uansett avdeling)
-- kan innstille/oppheve -- mer en driftsmelding enn en strukturell
-- rute-endring, derfor can_manage_department i stedet for is_admin() som for
-- selve ruten.
create table if not exists public.route_cancellations (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  cancellation_date date not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (route_id, cancellation_date)
);
alter table public.route_cancellations enable row level security;
create policy "Alle kan lese innstilte ruter" on public.route_cancellations for select to authenticated using (true);
create policy "Admin/moderator kan innstille ruter" on public.route_cancellations for insert to authenticated
  with check (exists (select 1 from public.routes r where r.id = route_id and public.can_manage_department(r.department_id)));
create policy "Admin/moderator kan fjerne innstilling" on public.route_cancellations for delete to authenticated
  using (exists (select 1 from public.routes r where r.id = route_id and public.can_manage_department(r.department_id)));
create index if not exists route_cancellations_date_idx on public.route_cancellations(cancellation_date);

-- ============================================================
-- 3. Timeregistreringer (klokke inn/ut ELLER manuelt antall timer, + rute)
-- ============================================================
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null,
  hours numeric(5,2),
  description text,
  clock_in timestamptz,
  clock_out timestamptz,
  -- Automatisk pause (se compute_time_entry_hours) -- kun informativt,
  -- trekkes IKKE fra hours.
  break_start timestamptz,
  break_end timestamptz,
  department_id uuid references public.departments(id) on delete set null,
  route_id uuid references public.routes(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_hours_check check (hours is null or (hours > 0 and hours <= 24)),
  constraint time_entries_hours_or_open_punch check (hours is not null or (clock_in is not null and clock_out is null))
);
alter table public.time_entries enable row level security;

-- Forhindrer at to sjåfører er klokket inn på samme bil samtidig (kun én
-- åpen stempling -- clock_out is null -- per bil om gangen).
create unique index if not exists time_entries_one_open_punch_per_vehicle
  on public.time_entries (vehicle_id)
  where clock_out is null and vehicle_id is not null;

-- vehicle_is_in_use(): brukes til å sjekke FØR man klokker inn, uten å
-- lekke hvem/hva som er registrert på bilen (bare et ja/nei-svar). Kjører
-- med forhøyede rettigheter siden RLS ellers ville skjult andres rader.
create or replace function public.vehicle_is_in_use(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.time_entries
    where vehicle_id = p_vehicle_id and clock_out is null
  );
$$;
grant execute on function public.vehicle_is_in_use(uuid) to authenticated;

-- hours regnes automatisk ut fra klokke inn/ut -- all registrering og
-- redigering (selv manuell korrigering) setter klokke inn/ut, aldri hours
-- direkte. Avrunding til 2 desimaler kunne runde ned til 0.00 for svært
-- korte økter og brøt "hours > 0" -- derfor et gulv på 0.01 for enhver
-- reell (positiv) varighet. Skift på minst 8t får i tillegg en automatisk
-- 30-minutters pause registrert 4t etter klokke inn -- kun informativt,
-- trekkes ikke fra hours.
create or replace function public.compute_time_entry_hours()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.clock_in is not null and new.clock_out is not null then
    if new.clock_out <= new.clock_in then
      raise exception 'Til-tidspunkt må være etter fra-tidspunkt';
    end if;
    new.hours = greatest(round(extract(epoch from (new.clock_out - new.clock_in)) / 3600.0, 2), 0.01);

    if new.clock_out - new.clock_in >= interval '8 hours' then
      new.break_start = new.clock_in + interval '4 hours';
      new.break_end = new.break_start + interval '30 minutes';
    else
      new.break_start = null;
      new.break_end = null;
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_compute_time_entry_hours before insert or update on public.time_entries
  for each row execute procedure public.compute_time_entry_hours();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_time_entries_updated_at before update on public.time_entries
  for each row execute procedure public.set_updated_at();

-- Helligdager/helg -- brukes til å sperre sjåførs egen innklokking (se
-- insert-policyen under) og senere kalenderfunksjoner (arbeidsuke/kalender).
create or replace function public.easter_sunday(y int)
returns date language plpgsql immutable set search_path = public as $$
declare
  a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mo int; da int;
begin
  a := y % 19;
  b := y / 100;
  c := y % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19*a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2*e + 2*i - h - k) % 7;
  m := (a + 11*h + 22*l) / 451;
  mo := (h + l - 7*m + 114) / 31;
  da := ((h + l - 7*m + 114) % 31) + 1;
  return make_date(y, mo, da);
end;
$$;

create or replace function public.is_norwegian_public_holiday(d date)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  y int := extract(year from d)::int;
  easter date := public.easter_sunday(y);
begin
  return d in (
    make_date(y, 1, 1),
    easter - 3, easter - 2, easter, easter + 1,
    make_date(y, 5, 1),
    easter + 39,
    make_date(y, 5, 17),
    easter + 49, easter + 50,
    make_date(y, 12, 25), make_date(y, 12, 26)
  );
end;
$$;

create or replace function public.is_business_day(d date)
returns boolean language sql immutable set search_path = public as $$
  select extract(isodow from d) not in (6, 7) and not public.is_norwegian_public_holiday(d);
$$;

grant execute on function public.easter_sunday(int) to authenticated;
grant execute on function public.is_norwegian_public_holiday(date) to authenticated;
grant execute on function public.is_business_day(date) to authenticated;

-- Sjafor ser/redigerer kun egne (og kun de siste 3 dagene). Admin og
-- moderator ser/overstyrer alle, uansett avdeling (can_manage_user).
-- Håndheves i databasen, ikke bare i appen.
create policy "Egne registreringer eller stab ser alle" on public.time_entries for select to authenticated
  using (auth.uid() = user_id or public.can_manage_user(user_id));
-- Sjafor kan kun opprette EGEN registrering via klokke inn: i dag, virkedag,
-- med bil+rute valgt, som en åpen stempling (ikke Fra-til). Stab
-- (can_manage_user) er upåvirket av disse vilkårene.
create policy "Sjafor klokker inn i dag (virkedag, bil+rute), stab uansett avdeling" on public.time_entries for insert to authenticated
  with check (
    (
      auth.uid() = user_id
      and entry_date = current_date
      and clock_out is null
      and vehicle_id is not null
      and route_id is not null
      and public.is_business_day(entry_date)
    )
    or public.can_manage_user(user_id)
  );
create policy "Sjafor endrer egne innen 3 dager, stab uansett avdeling" on public.time_entries for update to authenticated
  using ((auth.uid() = user_id and entry_date >= (current_date - interval '3 days')) or public.can_manage_user(user_id));
create policy "Sjafor sletter egne innen 3 dager, stab uansett avdeling" on public.time_entries for delete to authenticated
  using ((auth.uid() = user_id and entry_date >= (current_date - interval '3 days')) or public.can_manage_user(user_id));

-- Sjåfør kan ikke endre sitt eget klokke inn-tidspunkt i etterkant (kun
-- klokke ut/notat via redigering). Stab er upåvirket.
create or replace function public.prevent_sjafor_clock_in_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.user_id and new.clock_in is distinct from old.clock_in then
    if exists (select 1 from public.profiles where id = auth.uid() and role = 'sjafor') then
      raise exception 'Sjåfør kan ikke endre klokke inn-tidspunktet';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_prevent_sjafor_clock_in_edit before update on public.time_entries
  for each row execute procedure public.prevent_sjafor_clock_in_edit();

-- Hindrer at samme bruker får to overlappende tidsregistreringer (både
-- doble innklokkinger og manuelle/administrerte registreringer som
-- overlapper i tid). Åpne stemplinger (clock_out is null) regnes som
-- varende til uendelig, så man ikke kan klokke inn på nytt før man har
-- klokket ut. Rører ikke rader uten klokke inn (eldre historiske rader).
create or replace function public.prevent_overlapping_time_entries()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.clock_in is null then
    return new;
  end if;
  if exists (
    select 1 from public.time_entries t
    where t.user_id = new.user_id
      and t.id <> new.id
      and t.clock_in is not null
      and new.clock_in < coalesce(t.clock_out, 'infinity'::timestamptz)
      and coalesce(new.clock_out, 'infinity'::timestamptz) > t.clock_in
  ) then
    raise exception 'overlapping_time_entry';
  end if;
  return new;
end;
$$;
create trigger trg_prevent_overlapping_time_entries before insert or update of clock_in, clock_out on public.time_entries
  for each row execute procedure public.prevent_overlapping_time_entries();

create index if not exists time_entries_user_idx on public.time_entries(user_id);
create index if not exists time_entries_date_idx on public.time_entries(entry_date);

-- Kreves for at postgres_changes-abonnement (Supabase Realtime) skal
-- trigges -- brukes av Kalender-skjermen i mobilappen for å oppdatere
-- "Aktive nå" live når noen klokker inn/ut.
alter publication supabase_realtime add table public.time_entries;

-- ============================================================
-- 4. Fravær (sykdom/egenmelding, sykemelding/legemeldt, sykt barn, ferie,
--    permisjon). Merk: enum-verdien heter fortsatt "sykdom_legemeldt" av
--    historiske årsaker, men vises som "Sykemelding" i appen.
-- ============================================================
-- "fri" er en planlagt fridag (admin-only, se absence_type_requires_admin
-- under) -- teller ikke mot feriekvoten og får ikke automatisk 8t.
create type public.absence_type as enum ('sykdom_egenmelding', 'sykdom_legemeldt', 'sykt_barn', 'ferie', 'permisjon', 'fri');
create type public.absence_status as enum ('venter', 'godkjent', 'avslatt');

create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.absence_type not null,
  start_date date not null,
  end_date date not null,
  note text,
  status public.absence_status not null default 'venter',
  hours numeric(5,2) check (hours is null or (hours > 0 and hours <= 24)), -- timer PER DAG i perioden
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint absences_date_order check (end_date >= start_date)
);
alter table public.absences enable row level security;

-- Egenmelding og sykt barn krever manuell godkjenning (status = 'venter'),
-- akkurat som ferie/permisjon -- men får likevel 8 timer/dag automatisk hvis
-- ikke annet er satt, UANSETT om det kommer fra hurtigknappen eller det
-- vanlige skjemaet (styres av type, ikke av hvordan raden ble opprettet).
-- Sykemelding (legeerklært) forblir automatisk godkjent siden kun admin kan
-- registrere den i utgangspunktet (jf. absence_type_requires_admin under).
create or replace function public.handle_absence_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.type in ('sykdom_egenmelding', 'sykdom_legemeldt', 'sykt_barn') then
    new.hours = coalesce(new.hours, 8);
  end if;

  if new.type = 'sykdom_legemeldt' then
    new.status = 'godkjent';
    new.decided_at = now();
    new.decided_by = null;
  else
    new.status = 'venter';
    new.decided_at = null;
    new.decided_by = null;
  end if;
  return new;
end;
$$;
create trigger trg_absence_insert before insert on public.absences
  for each row execute procedure public.handle_absence_insert();

-- Hindrer dobbel registrering av fravær: en ny søknad kan ikke overlappe
-- en eksisterende venter/godkjent søknad for samme bruker (uansett type).
-- Avslåtte søknader teller ikke, så man kan sende inn på nytt etter avslag.
create or replace function public.prevent_duplicate_absence()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.absences a
    where a.user_id = new.user_id
      and a.status in ('venter', 'godkjent')
      and new.start_date <= a.end_date
      and new.end_date >= a.start_date
  ) then
    raise exception 'duplicate_absence';
  end if;
  return new;
end;
$$;
create trigger trg_prevent_duplicate_absence before insert on public.absences
  for each row execute procedure public.prevent_duplicate_absence();

-- Ferie/permisjon/sykemelding (legeerklaert)/fri er sensitivt og
-- administreres KUN av admin -- verken sjafor selv eller moderator har
-- tilgang, uansett avdeling. Egenmelding/sykt barn folger vanlig
-- can_manage_user (admin eller moderator i samme avdeling), siden stab
-- trenger a se dette lopende.
create or replace function public.absence_type_requires_admin(t public.absence_type)
returns boolean language sql immutable set search_path = public as $$
  select t in ('ferie', 'permisjon', 'sykdom_legemeldt', 'fri');
$$;

create policy "Fravaer: egenmelding/sykt barn selv/stab, ferie/permisjon/sykemelding kun admin" on public.absences for insert to authenticated
  with check (
    case
      when public.absence_type_requires_admin(type) then public.is_admin()
      else (auth.uid() = user_id or public.can_manage_user(user_id))
    end
  );
create policy "Egne soknader alltid, ferie/permisjon/sykemelding kun admin for andre" on public.absences for select to authenticated
  using (
    auth.uid() = user_id
    or case
      when public.absence_type_requires_admin(type) then public.is_admin()
      else public.can_manage_user(user_id)
    end
  );
create policy "Sjafor endrer egen ventende sokand, ferie/permisjon/sykemelding kun admin" on public.absences for update to authenticated
  using (
    (auth.uid() = user_id and status = 'venter')
    or case
      when public.absence_type_requires_admin(type) then public.is_admin()
      else public.can_manage_user(user_id)
    end
  );
create policy "Sjafor sletter egen ventende sokand, ferie/permisjon/sykemelding kun admin" on public.absences for delete to authenticated
  using (
    (auth.uid() = user_id and status = 'venter')
    or case
      when public.absence_type_requires_admin(type) then public.is_admin()
      else public.can_manage_user(user_id)
    end
  );

create index if not exists absences_user_idx on public.absences(user_id);
create index if not exists absences_date_idx on public.absences(start_date, end_date);

-- Kun stab (uansett avdeling) kan sette status til godkjent/avslått for
-- FERIE/PERMISJON (sykdom er allerede avgjort av triggeren over). For
-- ferie/permisjon/sykemelding kreves admin spesifikt, jf. RLS-policyene over.
create or replace function public.handle_absence_decision()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('godkjent', 'avslatt') then
      if public.absence_type_requires_admin(new.type) then
        if not public.is_admin() then
          raise exception 'Kun admin kan godkjenne eller avsla ferie/permisjon/sykemelding';
        end if;
      elsif not public.can_manage_user(new.user_id) then
        raise exception 'Kun admin/moderator for denne avdelingen kan godkjenne eller avsla fravaer';
      end if;
      new.decided_by = auth.uid();
      new.decided_at = now();
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_absence_decision before update on public.absences
  for each row execute procedure public.handle_absence_decision();

-- Hovedregelen for egenmelding (uten IA-avtale): maks 3 sammenhengende dager
-- per periode, og maks 4 perioder i lopet av siste 12 maneder. Blokkerer
-- IKKE registreringen -- sender et eget varsel til stab (type
-- 'egenmelding_grense') om at grensen er naadd/oversteget, til oppfolging.
create or replace function public.notify_on_egenmelding_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reporter_name text;
  period_count integer;
  current_period_len integer;
begin
  if new.type <> 'sykdom_egenmelding' then
    return new;
  end if;

  with all_ranges as (
    select start_date, end_date
    from public.absences
    where user_id = new.user_id and type = 'sykdom_egenmelding' and status = 'godkjent'
      and start_date >= (new.end_date - interval '365 days')::date and id <> new.id
    union all
    select new.start_date, new.end_date
  ),
  ordered as (
    select start_date, end_date, lag(end_date) over (order by start_date) as prev_end
    from all_ranges
  ),
  flagged as (
    select start_date, end_date,
      case when prev_end is null or start_date > prev_end + 1 then 1 else 0 end as new_group
    from ordered
  ),
  grouped_rows as (
    select start_date, end_date, sum(new_group) over (order by start_date) as grp
    from flagged
  ),
  periods as (
    select grp, min(start_date) as period_start, max(end_date) as period_end
    from grouped_rows group by grp
  )
  select count(*),
    max(period_end - period_start + 1) filter (
      where new.start_date between period_start and period_end
         or new.end_date between period_start and period_end
    )
  into period_count, current_period_len
  from periods;

  if period_count > 4 or coalesce(current_period_len, 0) > 3 then
    select full_name into reporter_name from public.profiles where id = new.user_id;
    insert into public.notifications (type, title, body, related_table, related_id, created_by)
    values (
      'egenmelding_grense',
      reporter_name || ' har brukt opp egenmeldingsdagene',
      case
        when coalesce(current_period_len, 0) > 3 then 'Denne egenmeldingsperioden er ' || current_period_len || ' dager (maks 3 sammenhengende dager uten legeerklæring).'
        else 'Dette er egenmeldingsperiode nummer ' || period_count || ' siste 12 måneder (maks 4). Vurder å be om legeerklæring fremover.'
      end,
      'absences', new.id, new.user_id
    );
  end if;

  return new;
end;
$$;
create trigger trg_notify_egenmelding_limit after insert on public.absences
  for each row execute procedure public.notify_on_egenmelding_limit();

-- vacation_days_used(): summerer overlappende dager mellom hver 'ferie'-søknad
-- (venter/godkjent) og et gitt kalenderår, for kvotevisning i UI. Kjører med
-- kallerens egne RLS-rettigheter (ikke security definer) -- ansatte ser bare
-- sitt eget forbruk, admin/moderator ser det de allerede har tilgang til.
create or replace function public.vacation_days_used(p_user_id uuid, p_year int)
returns integer language sql stable security invoker set search_path = public as $$
  select coalesce(sum(
    greatest(
      0,
      (least(end_date, make_date(p_year, 12, 31)) - greatest(start_date, make_date(p_year, 1, 1)) + 1)
    )
  ), 0)::integer
  from absences
  where user_id = p_user_id
    and type = 'ferie'
    and status in ('venter', 'godkjent')
    and start_date <= make_date(p_year, 12, 31)
    and end_date >= make_date(p_year, 1, 1);
$$;
grant execute on function public.vacation_days_used(uuid, int) to authenticated;

-- Lar den ansatte selv se hvor mange egenmeldingsperioder de har brukt siste
-- 12 måneder, samme grense som notify_on_egenmelding_limit() varsler stab om
-- (maks 4 perioder, maks 3 sammenhengende dager uten legeerklæring). Kjører
-- med kallerens egne RLS-rettigheter -- ansatte ser bare sitt eget forbruk,
-- admin/moderator kan slå opp andres siden de uansett har tilgang via
-- can_manage_user. Grupperer sammenhengende/overlappende perioder likt som
-- varsel-triggeren, men uten å inkludere en ny (ikke-innsendt) rad.
create or replace function public.egenmelding_usage(p_user_id uuid)
returns table(period_count integer, longest_period_days integer)
language sql stable security invoker set search_path = public as $$
  with ranges as (
    select start_date, end_date
    from public.absences
    where user_id = p_user_id
      and type = 'sykdom_egenmelding'
      and status = 'godkjent'
      and start_date >= (current_date - interval '365 days')::date
  ),
  ordered as (
    select start_date, end_date, lag(end_date) over (order by start_date) as prev_end
    from ranges
  ),
  flagged as (
    select start_date, end_date,
      case when prev_end is null or start_date > prev_end + 1 then 1 else 0 end as new_group
    from ordered
  ),
  grouped_rows as (
    select start_date, end_date, sum(new_group) over (order by start_date) as grp
    from flagged
  ),
  periods as (
    select grp, min(start_date) as period_start, max(end_date) as period_end
    from grouped_rows group by grp
  )
  select count(*)::integer, coalesce(max(period_end - period_start + 1), 0)::integer
  from periods;
$$;
grant execute on function public.egenmelding_usage(uuid) to authenticated;

-- ============================================================
-- 5. Hendelser (utforkjøring, biltrøbbel, service/verksted, annet) --
--    registreres på BIL, ikke rute.
-- ============================================================
create type public.event_type as enum ('utforkjoring', 'biltrobbel', 'verksted_service', 'annet');

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  type public.event_type not null,
  note text,
  occurred_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;

-- Ansatte i samme avdeling som bilen kan også se hva som er rapportert på
-- den (uansett hvem som meldte det) -- nyttig før man tar en bil i bruk.
create policy "Egne hendelser, stab i avdeling, eller samme avdeling som bilen" on public.events for select to authenticated
  using (
    auth.uid() = user_id
    or public.can_manage_user(user_id)
    or exists (
      select 1 from public.vehicles v
      join public.profiles me on me.id = auth.uid()
      where v.id = events.vehicle_id and v.department_id is not null and v.department_id = me.department_id
    )
  );
create policy "Bruker kan opprette egne hendelser" on public.events for insert to authenticated
  with check (auth.uid() = user_id);
create policy "Stab kan oppdatere hendelser" on public.events for update to authenticated
  using (public.can_manage_user(user_id));
create policy "Stab kan slette hendelser" on public.events for delete to authenticated
  using (public.can_manage_user(user_id));

create index if not exists events_user_idx on public.events(user_id);
create index if not exists events_occurred_idx on public.events(occurred_at);

create or replace function public.handle_event_resolution()
returns trigger language plpgsql as $$
begin
  if new.resolved is distinct from old.resolved and new.resolved = true then
    new.resolved_by = auth.uid();
    new.resolved_at = now();
  end if;
  return new;
end;
$$;
create trigger trg_event_resolution before update on public.events
  for each row execute procedure public.handle_event_resolution();

-- ============================================================
-- 6. Varsler til stab + push (Expo). Kan arkiveres slik at de ikke blir
--    liggende for evig.
-- ============================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  body text,
  related_table text,
  related_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;

-- Service-påminnelser (2 dager før) er synlige for admin og moderator,
-- uansett avdeling -- speiler skrivetilgangen på vehicle_service_bookings
-- over.
create policy "Stab kan lese varsler" on public.notifications for select to authenticated
  using (
    public.is_admin()
    or public.can_manage_user(created_by)
    or (
      type = 'service_paaminnelse'
      and exists (
        select 1 from public.vehicle_service_bookings b
        join public.vehicles v on v.id = b.vehicle_id
        where b.id = notifications.related_id and public.can_manage_department(v.department_id)
      )
    )
  );
create policy "Stab kan arkivere varsler" on public.notifications for update to authenticated
  using (public.is_admin() or public.can_manage_user(created_by))
  with check (public.is_admin() or public.can_manage_user(created_by));

create or replace function public.notify_on_sick_absence()
returns trigger language plpgsql security definer set search_path = public as $$
declare reporter_name text;
begin
  if new.type in ('sykdom_egenmelding', 'sykdom_legemeldt', 'sykt_barn') then
    select full_name into reporter_name from public.profiles where id = new.user_id;
    insert into public.notifications (type, title, body, related_table, related_id, created_by)
    values ('sykdom', reporter_name || ' har meldt sykdag',
      case new.type when 'sykt_barn' then 'Sykt barn' when 'sykdom_legemeldt' then 'Sykemelding' else 'Sykdom (egenmelding)' end
        || ' fra ' || to_char(new.start_date, 'DD.MM.YYYY') || ' til ' || to_char(new.end_date, 'DD.MM.YYYY'),
      'absences', new.id, new.user_id);
  end if;
  return new;
end;
$$;
create trigger trg_notify_sick_absence after insert on public.absences
  for each row execute procedure public.notify_on_sick_absence();

create or replace function public.notify_on_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare reporter_name text; type_label text;
begin
  select full_name into reporter_name from public.profiles where id = new.user_id;
  type_label := case new.type
    when 'utforkjoring' then 'Utforkjøring' when 'biltrobbel' then 'Biltrøbbel'
    when 'verksted_service' then 'Service/verksted-varsel' else 'Hendelse' end;
  insert into public.notifications (type, title, body, related_table, related_id, created_by)
  values ('hendelse', type_label || ' meldt av ' || reporter_name, new.note, 'events', new.id, new.user_id);
  return new;
end;
$$;
create trigger trg_notify_event after insert on public.events
  for each row execute procedure public.notify_on_event();

-- Kaller notify-staff-push Edge Function for hvert nye varsel via pg_net.
-- Bruker prosjektets offentlige anon-nøkkel (samme som i klient-appene) som
-- Authorization-header -- ikke en hemmelighet, kun en gyldig JWT for å
-- passere Supabase sin verify_jwt-sjekk. Selve funksjonen stoler kun på
-- notification_id og slår opp innholdet selv med service role.
-- OBS: bytt ut ANON_KEY_HER og PROSJEKT_URL_HER ved oppsett i nytt prosjekt.
create extension if not exists pg_net with schema extensions;

create or replace function public.trigger_push_on_notification()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'PROSJEKT_URL_HER/functions/v1/notify-staff-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ANON_KEY_HER'),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$$;
create trigger trg_push_on_notification after insert on public.notifications
  for each row execute procedure public.trigger_push_on_notification();

-- Daglig jobb: varsler admin + moderator 2 dager før planlagt
-- service/verksted på en bil (se notify-staff-push Edge Function, som
-- sender push til all stab uansett varseltype). not exists-sjekken hindrer
-- duplikatvarsel om jobben kjører flere ganger.
create or replace function public.notify_service_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare
  booking record;
  vehicle_label text;
begin
  for booking in
    select b.id, b.service_date, b.service_time, b.note, v.name, v.make
    from public.vehicle_service_bookings b
    join public.vehicles v on v.id = b.vehicle_id
    where b.service_date = current_date + interval '2 days'
      and not exists (
        select 1 from public.notifications n
        where n.type = 'service_paaminnelse' and n.related_table = 'vehicle_service_bookings' and n.related_id = b.id
      )
  loop
    vehicle_label := coalesce(booking.make || ' - ', '') || booking.name;
    insert into public.notifications (type, title, body, related_table, related_id)
    values (
      'service_paaminnelse',
      vehicle_label || ' har service om 2 dager',
      to_char(booking.service_date, 'DD.MM.YYYY')
        || case when booking.service_time is not null then ' kl. ' || to_char(booking.service_time, 'HH24:MI') else '' end
        || case when booking.note is not null then ' — ' || booking.note else '' end,
      'vehicle_service_bookings', booking.id
    );
  end loop;
end;
$$;
select cron.schedule('service-booking-reminders', '0 6 * * *', $$select public.notify_service_reminders();$$);

-- ============================================================
-- 7. Endringslogg (kun admin leser -- uavhengig av avdeling; ALLE kan logge
--    egne handlinger -- typisk sjåfør som korrigerer/sletter egne timer,
--    eller stab som endrer/sletter brukere/avdelingstilknytning)
-- ============================================================
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  reason text,
  details text,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create policy "Admin leser endringslogg" on public.audit_log for select to authenticated using (public.is_admin());
create policy "Alle kan logge egne handlinger" on public.audit_log for insert to authenticated
  with check (auth.uid() = actor_id);

-- ============================================================
-- 8. Push-tokens (mobilapp, Expo)
-- ============================================================
create table if not exists public.push_tokens (
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.push_tokens enable row level security;
create policy "Bruker kan lese egne push-tokens" on public.push_tokens for select to authenticated using (auth.uid() = user_id);
create policy "Bruker kan registrere egen push-token" on public.push_tokens for insert to authenticated with check (auth.uid() = user_id);
-- Kreves for at upsert() skal kunne oppdatere updated_at når samme
-- token registreres på nytt (skjer ved hver app-åpning).
create policy "Bruker kan oppdatere egen push-token" on public.push_tokens for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Bruker kan slette egen push-token" on public.push_tokens for delete to authenticated using (auth.uid() = user_id);

-- Lar hver admin/moderator selv skru av push-varsel (kun push til telefonen
-- -- varselet vises uansett fortsatt i Varsler-lista) per varseltype. Fravær
-- av en rad for en gitt (user_id, notification_type) betyr "på" (standard) --
-- rader trenger derfor bare finnes for typer noen faktisk har endret.
create table if not exists public.push_notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, notification_type)
);
alter table public.push_notification_preferences enable row level security;
create policy "Bruker styrer egne push-preferanser" on public.push_notification_preferences for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 9. Planlagt opprydding -- sletter kontoer som har stått
--    deaktivert (profiles.deactivated_at) i over 1 år.
-- ============================================================
create or replace function public.delete_expired_deactivated_users()
returns void language plpgsql security definer set search_path = public as $$
declare
  target record;
begin
  for target in
    select id, full_name, email
    from public.profiles
    where deactivated_at is not null and deactivated_at < now() - interval '1 year'
  loop
    insert into public.audit_log (actor_id, action, target_type, target_id, reason, details)
    values (
      null, 'user.deleted', 'profiles', target.id, 'Automatisk sletting',
      target.full_name || ' (' || target.email || ') -- deaktivert i over 1 år'
    );
    delete from auth.users where id = target.id;
  end loop;
end;
$$;

create extension if not exists pg_cron with schema extensions;
select cron.schedule('delete-expired-deactivated-users', '0 3 * * *', $$select public.delete_expired_deactivated_users();$$);

notify pgrst, 'reload schema';
