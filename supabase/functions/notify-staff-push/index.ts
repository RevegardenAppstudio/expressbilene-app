// Edge Function: notify-staff-push
// Kalles av en Postgres-trigger (AFTER INSERT on notifications) via pg_net.
// Trigges kun med en notification_id -- funksjonen slår selv opp raden med
// service role og bruker KUN det som faktisk står i databasen (tittel/tekst),
// aldri noe klienten/kalleren sender inn. Dermed kan ikke endepunktet
// misbrukes til å sende vilkårlig tekst som push, selv om det nås.
// verify_jwt er PÅ (standard) -- pg_net-kallet bruker prosjektets offentlige
// publishable/anon-nøkkel som Authorization-header, som holder for å passere
// Supabase sin JWT-sjekk uten at noen hemmelighet trenger å lagres i kode.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    const { notification_id: notificationId } = await req.json();
    if (!notificationId) {
      return new Response(JSON.stringify({ error: "notification_id er påkrevd" }), { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: notification, error: notificationError } = await adminClient
      .from("notifications")
      .select("type, title, body")
      .eq("id", notificationId)
      .single();

    if (notificationError || !notification) {
      return new Response(JSON.stringify({ error: "Fant ikke varselet" }), { status: 404 });
    }

    // Push sendes til all stab (admin + moderator) uavhengig av avdeling --
    // matcher in-app-synligheten i Varsler, som heller ikke lenger er
    // avdelings-begrenset for moderator (se can_manage_user/
    // can_manage_department i schema.sql). Den enkelte kan likevel skru av
    // push for én varseltype om gangen i appen (Innstillinger) -- varselet
    // vises uansett fortsatt i Varsler-lista, det er kun push som stoppes.
    const { data: staff, error: staffError } = await adminClient
      .from("profiles")
      .select("id")
      .in("role", ["admin", "moderator"]);

    if (staffError) {
      return new Response(JSON.stringify({ error: staffError.message }), { status: 500 });
    }

    let staffIds = (staff ?? []).map((s) => s.id);
    if (staffIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const { data: optedOut, error: prefsError } = await adminClient
      .from("push_notification_preferences")
      .select("user_id")
      .eq("notification_type", notification.type)
      .eq("enabled", false)
      .in("user_id", staffIds);

    if (prefsError) {
      return new Response(JSON.stringify({ error: prefsError.message }), { status: 500 });
    }

    const optedOutIds = new Set((optedOut ?? []).map((p) => p.user_id));
    staffIds = staffIds.filter((id) => !optedOutIds.has(id));
    if (staffIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const { data: tokenRows, error: tokenError } = await adminClient
      .from("push_tokens")
      .select("token")
      .in("user_id", staffIds);

    if (tokenError) {
      return new Response(JSON.stringify({ error: tokenError.message }), { status: 500 });
    }

    const tokens = Array.from(new Set((tokenRows ?? []).map((t) => t.token))).filter((t) =>
      t.startsWith("ExponentPushToken")
    );

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const messages = tokens.map((to) => ({
      to,
      title: notification.title,
      body: notification.body ?? "",
      sound: "default",
    }));

    const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });

    const expoResult = await expoRes.json();

    return new Response(JSON.stringify({ sent: tokens.length, expo: expoResult }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
