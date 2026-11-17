import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { decodeEventCursor, encodeEventCursor } from "@/lib/event-cursor";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/events/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiPermission(request, "messages.read");
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const cursorValue = url.searchParams.get("cursor");
        const after = decodeEventCursor(cursorValue);
        const requestedLimit = Number(url.searchParams.get("limit") || 100);
        const limit = Math.max(1, Math.min(200, requestedLimit));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // A primeira chamada estabelece o cursor atual. Os hooks já carregam o
        // snapshot por suas APIs; reproduzir todo o histórico aqui disparava
        // uma recarga de /api/chats para cada evento antigo.
        if (!cursorValue) {
          const [{ data: latest }, { data: presences }] = await Promise.all([
            supabaseAdmin
              .from("inbox_events")
              .select("sequence")
              .eq("workspace_id", auth.workspaceId)
              .order("sequence", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabaseAdmin
              .from("whatsapp_presence")
              // Presence is tenant + instance scoped.  Returning the canonical
              // instance id is required by the client to build a collision-free
              // key when two WhatsApp connections contain the same phone.
              .select("phone,state,updated_at,instance_id,instance_name")
              .eq("workspace_id", auth.workspaceId)
              .gte("updated_at", new Date(Date.now() - 30_000).toISOString())
              .limit(500),
          ]);
          return json({
            events: [],
            cursor: encodeEventCursor(latest?.sequence ?? 0),
            hasMore: false,
            snapshot: { presences: presences ?? [] },
          });
        }

        const { data, error } = await supabaseAdmin
          .from("inbox_events")
          .select("sequence,event_type,entity_id,chat_id,payload,created_at")
          .eq("workspace_id", auth.workspaceId)
          .gt("sequence", after)
          .order("sequence", { ascending: true })
          .limit(limit + 1);
        if (error) return json({ error: "Falha ao ler eventos do painel" }, 500);

        const rows = data ?? [];
        const hasMore = rows.length > limit;
        const events = hasMore ? rows.slice(0, limit) : rows;
        const lastSequence = events.at(-1)?.sequence ?? after;

        return json({
          events,
          cursor: encodeEventCursor(lastSequence),
          hasMore,
        });
      },
    },
  },
});
