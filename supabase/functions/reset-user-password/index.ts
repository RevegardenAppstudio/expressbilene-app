// Edge Function: reset-user-password
// Admin eller moderator. Setter et nytt passord direkte for en ansatt --
// til bruk når noen er i en krise og ikke har tilgang til e-posten sin
// (vanlig "glemt passord"-lenke hjelper ikke da, siden den krever e-posttilgang).
// Moderator kan kun tilbakestille passord for sjafor-rollen, for å hindre at en
// moderator-konto kan ta over en annen moderator- eller admin-konto.
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

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("role, full_name")
      .eq("id", caller.id)
      .single();

    if (callerProfileError || !callerProfile || !["admin", "moderator"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Kun admin eller moderator kan tilbakestille passord" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const userId = body.user_id as string;
    const newPassword = body.new_password as string;

    if (!userId || !newPassword) {
      return new Response(JSON.stringify({ error: "user_id og new_password er påkrevd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: "Passordet må være minst 8 tegn" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single();

    if (targetError || !target) {
      return new Response(JSON.stringify({ error: "Fant ikke brukeren" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (callerProfile.role === "moderator" && target.role !== "sjafor") {
      return new Response(
        JSON.stringify({ error: "Moderator kan kun tilbakestille passord for sjåfører" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient.from("audit_log").insert({
      actor_id: caller.id,
      action: "user.password_reset",
      target_type: "profiles",
      target_id: userId,
      reason: typeof body.reason === "string" ? body.reason.trim() || null : null,
      details: `${target.full_name}: passord tilbakestilt av ${callerProfile.full_name}`,
    });

    return new Response(JSON.stringify({ ok: true }), {
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
