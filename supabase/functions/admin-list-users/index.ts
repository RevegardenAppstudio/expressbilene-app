// Edge Function: admin-list-users
// Admin eller moderator. Lister ALLE ansatte (alle avdelinger, begge roller
// ser det samme) med invitasjons-/innloggingsstatus fra auth.users
// (last_sign_in_at, invited_at) koblet med deres profiles-rad. Denne
// informasjonen er ikke tilgjengelig for klienten på annen måte, siden
// auth.users ikke eksponeres via vanlig RLS/PostgREST.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Mangler Authorization-header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Ugyldig sesjon" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, department_id")
      .eq("id", caller.id)
      .single();

    if (profileError || (callerProfile?.role !== "admin" && callerProfile?.role !== "moderator")) {
      return new Response(JSON.stringify({ error: "Kun admin/moderator kan liste brukere" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Moderator ser nå ansatte på tvers av alle avdelinger, akkurat som
    // admin -- kun selve CRUD-knappene (inviter/rediger/slett/deaktiver) er
    // fortsatt begrenset til admin i klienten.
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, email, full_name, role, department_id, deactivated_at, created_at, departments(name)")
      .order("full_name");

    if (profilesError) {
      return new Response(JSON.stringify({ error: profilesError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // auth.admin.listUsers() er paginert (maks 1000/side) -- henter alle sidene,
    // rikelig for et internt team.
    const authUsersById = new Map<string, { invited_at: string | null; last_sign_in_at: string | null }>();
    let page = 1;
    while (true) {
      const { data: pageData, error: listError } = await adminClient.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const u of pageData.users) {
        authUsersById.set(u.id, {
          invited_at: u.invited_at ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
      }
      if (pageData.users.length < 1000) break;
      page += 1;
    }

    const users = (profiles ?? []).map((p) => {
      const authInfo = authUsersById.get(p.id);
      const hasSignedIn = !!authInfo?.last_sign_in_at;
      return {
        ...p,
        last_sign_in_at: authInfo?.last_sign_in_at ?? null,
        status: p.deactivated_at ? "deaktivert" : hasSignedIn ? "aktiv" : "invitert",
      };
    });

    return new Response(JSON.stringify({ users }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
