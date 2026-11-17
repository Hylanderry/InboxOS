import { useEffect, useState } from "react";
import {
  CalendarDots,
  ChatCircleText,
  ClockCounterClockwise,
  DotsThree,
  Gear,
  House,
  Kanban,
  LinkSimple,
  ShieldCheck,
  Robot,
  UsersThree,
} from "@phosphor-icons/react";
import type { AppView } from "../navigation";

const primaryItems = [
  { id: "dashboard" as AppView, label: "Início", icon: House },
  { id: "crm" as AppView, label: "CRM", icon: Kanban },
  { id: "inbox" as AppView, label: "Inbox", icon: ChatCircleText },
  { id: "conexoes" as AppView, label: "Conexões", icon: LinkSimple },
];

const moreItems = [
  { id: "clientes" as AppView, label: "Clientes", icon: UsersThree },
  { id: "follow-up" as AppView, label: "Follow-up", icon: ClockCounterClockwise },
  { id: "calendario" as AppView, label: "Agenda", icon: CalendarDots },
  { id: "agentes" as AppView, label: "Agentes", icon: Robot },
  { id: "configuracoes" as AppView, label: "Ajustes", icon: Gear },
];

export function MobileDock({
  currentView,
  onSelectView,
  isSystemAdmin = false,
  onOpenAdmin,
  unread = 0,
  dark = true,
}: {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  isSystemAdmin?: boolean;
  onOpenAdmin?: () => void;
  unread?: number;
  dark?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const select = (view: AppView) => {
    setMoreOpen(false);
    onSelectView(view);
  };
  const isMoreActive = moreItems.some((item) => item.id === currentView);

  return (
    <nav
      className={`mobile-dock inboxos-mobile-dock ${dark ? "mobile-dock-dark" : "mobile-dock-light"}`}
      aria-label="Navegação principal"
    >
      {primaryItems.map(({ id, label, icon: Icon }) => {
        const active = currentView === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => select(id)}
            className={`mobile-dock-item ${active ? "is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            aria-label={
              id === "inbox" && unread > 0 ? `Inbox, ${unread} mensagens não lidas` : label
            }
          >
            <span className="relative">
              <Icon size={20} weight={active ? "fill" : "regular"} />
              {id === "inbox" && unread > 0 && (
                <span aria-hidden="true" className="mobile-dock-badge">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
      <div className="mobile-dock-more-wrap">
        {moreOpen && (
          <div className="mobile-dock-more-menu" role="menu" aria-label="Mais áreas do sistema">
            {moreItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                className="mobile-dock-more-item"
                onClick={() => select(id)}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </button>
            ))}
            {isSystemAdmin && onOpenAdmin && (
              <button
                type="button"
                role="menuitem"
                className="mobile-dock-more-item"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenAdmin();
                }}
              >
                <ShieldCheck size={18} aria-hidden="true" />
                Administração global
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          className={`mobile-dock-item ${isMoreActive ? "is-active" : ""}`}
          aria-label="Mais áreas"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
        >
          <DotsThree size={21} weight={moreOpen ? "fill" : "regular"} />
          <span>Mais</span>
        </button>
      </div>
    </nav>
  );
}
