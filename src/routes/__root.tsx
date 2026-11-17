import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import { ArrowClockwise, FileX, House, WarningCircle } from "@phosphor-icons/react";
import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { PLATFORM_BRAND_NAME } from "@/lib/platform-brand";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-zinc-900 px-4 py-8">
      <div className="w-full max-w-md text-center p-8 sm:p-10 rounded-3xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.06)] bg-white">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
          <FileX size={28} weight="bold" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
          Erro 404
        </span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">
          Página não encontrada
        </h1>
        <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
          O endereço acessado não existe, foi movido ou está temporariamente indisponível.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
          <Link
            to="/"
            search={{ view: "dashboard" }}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white transition-all hover:bg-black shadow-sm"
          >
            <House size={16} weight="bold" />
            <span>Voltar ao início</span>
          </Link>
          <Link
            to="/auth/login"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-50"
          >
            <span>Ir para o Login</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error instanceof Error ? error : new Error(String(error)));
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-zinc-900 px-4 py-8">
      <div className="w-full max-w-md text-center p-8 sm:p-10 rounded-3xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.06)] bg-white">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
          <WarningCircle size={28} weight="bold" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
          Status do Sistema
        </span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">
          Não foi possível carregar esta página
        </h1>
        <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
          Ocorreu uma instabilidade ou erro inesperado. Tente novamente ou retorne ao início seguro.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white transition-all hover:bg-black shadow-sm whitespace-nowrap"
          >
            <ArrowClockwise size={16} weight="bold" />
            <span>Tentar novamente</span>
          </button>
          <a
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-50 whitespace-nowrap"
          >
            <House size={16} weight="bold" />
            <span>Voltar ao início</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: `${PLATFORM_BRAND_NAME} — Operações de Atendimento` },
      { name: "description", content: "Central premium de atendimento e operações." },
      { property: "og:title", content: `${PLATFORM_BRAND_NAME} — Operações de Atendimento` },
      { property: "og:description", content: "Central premium de atendimento e operações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <div className="route-transition-shell" key={pathname} data-route-path={pathname}>
          <Outlet />
        </div>
        <Toaster closeButton />
        <Analytics />
        <SpeedInsights />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
