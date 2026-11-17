import {
  ChartDonut,
  Kanban,
  Tray,
  ClockCounterClockwise,
  PlugsConnected,
  Robot,
  GearSix,
  SignOut,
  ShieldCheck,
  CalendarDots,
  UsersThree,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearCurrentWorkspaceCache } from "@/lib/current-workspace";
import { loadWorkspaces, securityAction, type WorkspaceRole } from "../settings-api";
import type { AppView } from "../navigation";
import { appNavigationGroups } from "../navigation";
import { PLATFORM_BRAND_NAME } from "@/lib/platform-brand";

interface AccountRailProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  totalUnread: number;
  isDarkMode: boolean;
  isSystemAdmin?: boolean;
  brandName?: string;
}

const icons: Record<AppView, Icon> = {
  dashboard: ChartDonut,
  crm: Kanban,
  clientes: UsersThree,
  calendario: CalendarDots,
  inbox: Tray,
  "follow-up": ClockCounterClockwise,
  conexoes: PlugsConnected,
  agentes: Robot,
  configuracoes: GearSix,
  admin: ShieldCheck,
};

export function AccountRail({
  currentView,
  onSelectView,
  totalUnread,
  isDarkMode,
  isSystemAdmin = false,
  brandName = PLATFORM_BRAND_NAME,
}: AccountRailProps) {
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole | null>(null);
  const refreshRole = useCallback(async () => {
    try {
      const data = await loadWorkspaces();
      const activeId = data.activeWorkspaceId ?? data.workspaces[0]?.id ?? null;
      setWorkspaceRole(
        data.workspaces.find((workspace) => workspace.id === activeId)?.role ?? null,
      );
    } catch {
      setWorkspaceRole(null);
    }
  }, []);

  useEffect(() => {
    void refreshRole();
    const listener = () => void refreshRole();
    window.addEventListener("inboxos:workspace-change", listener);
    return () => window.removeEventListener("inboxos:workspace-change", listener);
  }, [refreshRole]);

  const logout = useCallback(async () => {
    try {
      await securityAction("revoke_current");
    } catch {
      /* Supabase sign-out still clears the local session. */
    }
    await supabase.auth.signOut();
    clearCurrentWorkspaceCache();
    window.location.assign("/auth/login");
  }, []);

  const itemClass = (active: boolean) =>
    `group flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150 ${
      active
        ? isDarkMode
          ? "bg-white/[0.075] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.055)]"
          : "bg-black/[0.055] text-neutral-950 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.035)]"
        : isDarkMode
          ? "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-100"
          : "text-neutral-500 hover:bg-black/[0.035] hover:text-neutral-900"
    }`;

  return (
    <aside
      className={`workspace-panel hidden h-full w-[228px] shrink-0 flex-col border-r px-3 py-3.5 lg:flex ${
        isDarkMode
          ? "border-white/[0.065] bg-[#0a0a0b] text-zinc-100"
          : "border-black/[0.07] bg-[#f7f7f6] text-neutral-900"
      }`}
      aria-label="Navegação do workspace"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-11 items-center gap-2.5 px-2">
          <div
            className={`grid h-7 w-7 place-items-center rounded-lg border p-1 ${
              isDarkMode ? "border-white/10 bg-white/[0.055]" : "border-black/10 bg-white"
            }`}
          >
            <img
              src={isDarkMode ? "/logo-dark-mode.png" : "/logo-light-mode.png"}
              alt={brandName}
              className="h-5 w-5 object-contain select-none"
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-none tracking-[-0.02em]">
              {brandName}
            </div>
          </div>
        </div>

        <nav className="mt-5 space-y-5" aria-label="Áreas do produto">
          {appNavigationGroups.map((group) => (
            <section key={group.label}>
              <p
                className={`px-2.5 text-[9px] font-semibold tracking-[0.16em] ${isDarkMode ? "text-zinc-600" : "text-neutral-400"}`}
              >
                {group.label}
              </p>
              <div className="mt-1.5 space-y-0.5">
                {group.items
                  .filter((item) => !(workspaceRole === "agent" && item.id === "agentes"))
                  .map((item) => {
                    const IconComponent = icons[item.id];
                    const active = currentView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectView(item.id)}
                        className={itemClass(active)}
                      >
                        <span className="flex items-center gap-2.5">
                          <IconComponent size={17} weight={active ? "fill" : "regular"} />
                          <span>{item.label}</span>
                        </span>
                        {item.id === "inbox" && totalUnread > 0 && (
                          <span
                            className={`min-w-5 rounded-md px-1.5 py-0.5 text-center text-[9px] font-semibold tabular-nums ${
                              isDarkMode
                                ? "bg-white/[0.09] text-zinc-200"
                                : "bg-black/[0.07] text-neutral-700"
                            }`}
                          >
                            {totalUnread > 99 ? "99+" : totalUnread}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </section>
          ))}
        </nav>

        <div className="mt-auto space-y-0.5 pt-5">
          {isSystemAdmin && (
            <button
              type="button"
              className={itemClass(currentView === "admin")}
              onClick={() => onSelectView("admin")}
            >
              <span className="flex items-center gap-2.5">
                <ShieldCheck size={17} />
                <span>ADM global</span>
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onSelectView("configuracoes")}
            className={itemClass(currentView === "configuracoes")}
          >
            <span className="flex items-center gap-2.5">
              <GearSix size={17} weight={currentView === "configuracoes" ? "fill" : "regular"} />
              <span>Configurações</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${isDarkMode ? "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-100" : "text-neutral-500 hover:bg-black/[0.035] hover:text-neutral-900"}`}
          >
            <SignOut size={17} />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
