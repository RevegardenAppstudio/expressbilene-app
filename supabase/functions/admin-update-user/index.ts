// Edge Function: admin-update-user
// Admin-only. Endrer navn/rolle/avdeling for en eksisterende ansatt. Kjører
// som service_role, som hopper over "prevent_role_self_escalation"-triggeren
// på profiles -- det er nettopp derfor rolleendring kun kan skje herfra, ikke
// direkte fra klienten.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  moderator: "Moderator",
  sjafor: "Sjåfør",
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
      .select("role")
      .eq("id", caller.id)
      .single();

    if (profileError || callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Kun admin kan endre brukere" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const userId = body.user_id as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id er påkrevd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof body.deactivate === "boolean" && userId === caller.id && body.deactivate) {
      return new Response(JSON.stringify({ error: "Du kan ikke deaktivere din egen konto" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // En bruker uten registrerte timer har ingenting å bevare -- da slettes
    // kontoen med det samme i stedet for å vente på 1-årsregelen. "Deaktiver"
    // er dermed den eneste knappen admin trenger.
    if (body.deactivate === true) {
      const { count: timeEntryCount } = await adminClient
        .from("time_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (!timeEntryCount) {
        const { data: target } = await adminClient.from("profiles").select("full_name, email").eq("id", userId).single();

        const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
        if (deleteError) {
          return new Response(JSON.stringify({ error: deleteError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await adminClient.from("audit_log").insert({
          actor_id: caller.id,
          action: "user.deleted",
          target_type: "profiles",
          target_id: userId,
          reason: typeof body.reason === "string" ? body.reason.trim() || null : null,
          details: target ? `${target.full_name} (${target.email}) -- ingen registrerte timer, slettet umiddelbart` : null,
        });

        return new Response(JSON.stringify({ ok: true, deleted: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.full_name === "string" && body.full_name.trim()) {
      updates.full_name = body.full_name.trim();
    }
    if (["admin", "moderator", "sjafor"].includes(body.role)) {
      updates.role = body.role;
    }
    if ("department_id" in body) {
      updates.department_id = body.department_id || null;
    }
    if (typeof body.deactivate === "boolean") {
      updates.deactivated_at = body.deactivate ? new Date().toISOString() : null;
    }

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ error: "Ingenting å oppdatere" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: before } = await adminClient
      .from("profiles")
      .select("full_name, role, department_id, deactivated_at")
      .eq("id", userId)
      .single();

    const { error: updateError } = await adminClient.from("profiles").update(updates).eq("id", userId);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deaktivering blokkerer også innlogging med det samme (ikke bare
    // profilflagget) -- reaktivering fjerner sperren igjen.
    if (typeof body.deactivate === "boolean") {
      const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: body.deactivate ? "876000h" : "none",
      });
      if (banError) {
        return new Response(JSON.stringify({ error: banError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Bygger en lesbar oppsummering av hva som faktisk endret seg, i stedet for
    // å dumpe rå JSON i endringsloggen (som viste seg å se ut som kode for admin).
    // Navnet på den ansatte tas alltid med foran endringene -- ellers vises ikke
    // hvem som ble påvirket når f.eks. bare avdelingen endres (flytt ansatt).
    const beforeName = before?.full_name ?? "ukjent bruker";
    const nameChanged = "full_name" in updates && before?.full_name !== updates.full_name;
    const subject = nameChanged ? `${beforeName} → ${updates.full_name}` : beforeName;

    const changeDescriptions: string[] = [];

    if ("role" in updates && before?.role !== updates.role) {
      const fromRole = ROLE_LABELS[before?.role as string] ?? before?.role ?? "ukjent";
      const toRole = ROLE_LABELS[updates.role as string] ?? (updates.role as string);
      changeDescriptions.push(`rolle fra ${fromRole} til ${toRole}`);
    }

    if ("department_id" in updates && before?.department_id !== updates.department_id) {
      const deptIds = [before?.department_id, updates.department_id].filter(
        (id): id is string => typeof id === "string"
      );
      const deptNames = new Map<string, string>();
      if (deptIds.length > 0) {
        const { data: deps } = await adminClient.from("departments").select("id, name").in("id", deptIds);
        for (const d of deps ?? []) deptNames.set(d.id, d.name);
      }
      const fromDept = before?.department_id ? deptNames.get(before.department_id as string) ?? "ukjent" : "ingen avdeling";
      const toDept = updates.department_id ? deptNames.get(updates.department_id as string) ?? "ukjent" : "ingen avdeling";
      changeDescriptions.push(`avdeling fra "${fromDept}" til "${toDept}"`);
    }

    if ("deactivated_at" in updates && !before?.deactivated_at !== !updates.deactivated_at) {
      changeDescriptions.push(updates.deactivated_at ? "deaktivert" : "reaktivert");
    }

    const details =
      changeDescriptions.length > 0
        ? `${subject}: ${changeDescriptions.join(", ")}`
        : nameChanged
          ? `Navn endret: ${subject}`
          : `${subject}: ingen faktiske endringer`;

    await adminClient.from("audit_log").insert({
      actor_id: caller.id,
      action: "user.updated",
      target_type: "profiles",
      target_id: userId,
      reason: typeof body.reason === "string" ? body.reason.trim() || null : null,
      details,
    });

    return new Response(JSON.stringify({ ok: true, deleted: false }), {
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
