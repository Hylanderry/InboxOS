import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { requireApiPermission } from "@/server/middleware/auth";
import { getEvolutionDeliveryDiagnostics } from "@/server/health-diagnostics";
import type { LiveAuthDatabase } from "@/server/auth/live-auth-database";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function matchesHealthSecret(request: Request) {
  const expected = process.env["HEALTHCHECK_SECRET"]?.trim();
  const provided = request.headers.get("x-healthcheck-secret")?.trim();
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const startedAt = Date.now();
        const detailed = new URL(request.url).searchParams.get("detailed") === "true";
        let workspaceId: string | null = null;
        const healthSecret = matchesHealthSecret(request);
        // Anonymous probes receive only the liveness contract. Database,
        // queue, schema and Evolution diagnostics require either the private
        // health secret or an authenticated workspace administrator.
        if (!detailed && !healthSecret) return json({ status: "ok" });
        if (!healthSecret) {
          const auth = await requireApiPermission(request, "workspace.read", "admin");
          if (auth instanceof Response) return json({ error: "Not found" }, 404);
          if (detailed) workspaceId = auth.workspaceId;
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const query = supabaseAdmin
            .from("whatsapp_instances")
            .select("id,status,connected_at", { count: "exact", head: true });
          const instanceQuery = workspaceId
            ? query.eq("workspace_id", workspaceId)
            : query.limit(1);
          const authSchemaDb = supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase>;
          const [
            instancesResult,
            messagesSchema,
            agentsSchema,
            authControlSchema,
            authSuspensionSchema,
            authSessionSchema,
            authChallengeSchema,
            authSecuritySchema,
            authEventsSchema,
            authDeliveriesSchema,
            authRegistrationSchema,
            authLegalSchema,
            privacySettingsSchema,
            companyBrandingSchema,
            knowledgeBaseSchema,
          ] = await Promise.all([
            instanceQuery,
            supabaseAdmin.from("messages").select("id,instance_id,identity_kind").limit(1),
            supabaseAdmin.from("automation_agents").select("id,runtime_config").limit(1),
            authSchemaDb.from("user_devices").select("id,device_token_hash").limit(1),
            authSchemaDb.from("system_user_controls").select("user_id,status").limit(1),
            authSchemaDb.from("user_sessions").select("id,token_hash,expires_at").limit(1),
            authSchemaDb
              .from("email_challenges")
              .select("id,code_hash,expires_at,consumed_at")
              .limit(1),
            authSchemaDb.from("security_events").select("id,event_type,created_at").limit(1),
            authSchemaDb.from("system_events").select("id,event_type,created_at").limit(1),
            authSchemaDb.from("notification_deliveries").select("id,status,created_at").limit(1),
            authSchemaDb
              .from("pending_registrations")
              .select("id,auth_user_id,expires_at,completed_at")
              .limit(1),
            authSchemaDb.from("legal_documents").select("id,slug,version,active").limit(1),
            authSchemaDb
              .from("workspace_privacy_settings")
              .select("workspace_id,ai_enabled,message_retention_days")
              .limit(1),
            authSchemaDb
              .from("workspace_company_profiles")
              .select("workspace_id,brand_name,white_label_enabled")
              .limit(1),
            authSchemaDb.from("workspace_knowledge_documents").select("id,title,active").limit(1),
          ]);
          const error = [
            instancesResult.error,
            messagesSchema.error,
            agentsSchema.error,
            authControlSchema.error,
            authSuspensionSchema.error,
            authSessionSchema.error,
            authChallengeSchema.error,
            authSecuritySchema.error,
            authEventsSchema.error,
            authDeliveriesSchema.error,
            authRegistrationSchema.error,
            authLegalSchema.error,
            privacySettingsSchema.error,
            companyBrandingSchema.error,
            knowledgeBaseSchema.error,
          ].find(Boolean);
          if (error) {
            const schemaDrift = [
              instancesResult.error,
              messagesSchema.error,
              agentsSchema.error,
              authControlSchema.error,
              authSuspensionSchema.error,
              authSessionSchema.error,
              authChallengeSchema.error,
              authSecuritySchema.error,
              authEventsSchema.error,
              authDeliveriesSchema.error,
              authRegistrationSchema.error,
              authLegalSchema.error,
              privacySettingsSchema.error,
              companyBrandingSchema.error,
              knowledgeBaseSchema.error,
            ]
              .filter(Boolean)
              .some(
                (item) =>
                  ["42703", "42P01", "PGRST205"].includes(String(item?.code ?? "")) ||
                  /column .* does not exist/i.test(String(item?.message ?? "")),
              );
            return json(
              {
                status: "degraded",
                database: schemaDrift ? "reachable" : "unreachable",
                ...(schemaDrift ? { schema: "outdated" } : {}),
                latencyMs: Date.now() - startedAt,
              },
              503,
            );
          }
          return json({
            status: "ok",
            database: "reachable",
            latencyMs: Date.now() - startedAt,
            ...(detailed
              ? {
                  instances: instancesResult.count ?? 0,
                  ...getEvolutionDeliveryDiagnostics(request, process.env),
                }
              : {}),
          });
        } catch {
          return json(
            { status: "degraded", database: "unreachable", latencyMs: Date.now() - startedAt },
            503,
          );
        }
      },
    },
  },
});
