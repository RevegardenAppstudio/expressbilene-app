import type { SupabaseClient } from "@supabase/supabase-js";

// Skriver til audit_log som den innloggede brukeren selv (RLS krever
// auth.uid() = actor_id, se "Alle kan logge egne handlinger" i schema.sql).
// Gjør ingenting hvis ingen er innlogget -- skal aldri skje i praksis siden
// dette kalles fra sider bak auth-gate.
export async function logAuditEvent(
  supabase: SupabaseClient,
  params: { action: string; targetType: string; targetId: string; reason: string; details: string }
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    reason: params.reason || null,
    details: params.details,
  });
}
