import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: {
        sitekey: string;
        callback?: (token: string) => void;
        "error-callback"?: (error: unknown) => void;
        "expired-callback"?: () => void;
        theme?: "light" | "dark" | "auto";
        size?: "normal" | "compact" | "invisible";
        appearance?: "always" | "execute" | "interaction-only";
      }) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  onTokenChange: (token: string | null) => void;
  theme?: "light" | "dark" | "auto";
  /** Use invisible mode — no widget rendered, token obtained silently */
  invisible?: boolean;
}

const SCRIPT_ID = "cf-turnstile-script";

function ensureScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Turnstile script")));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });
}

export function TurnstileWidget({
  siteKey,
  onTokenChange,
  theme = "auto",
  invisible = false,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void ensureScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        setLoaded(true);

        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          size: invisible ? "invisible" : "normal",
          appearance: invisible ? "execute" : "always",
          callback: (token: string) => {
            if (!cancelled) onTokenChange(token);
          },
          "expired-callback": () => {
            if (!cancelled) onTokenChange(null);
          },
          "error-callback": () => {
            if (!cancelled) onTokenChange(null);
          },
        });

        widgetIdRef.current = id;
      })
      .catch((err) => {
        console.error("[Turnstile] Failed to load:", err);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Widget may already be removed
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, invisible, onTokenChange]);

  // Invisible mode: no visible container needed
  if (invisible) {
    return <div ref={containerRef} style={{ display: "none" }} />;
  }

  return (
    <div
      className="turnstile-container"
      style={{ minHeight: loaded ? undefined : 65 }}
    >
      <div ref={containerRef} />
    </div>
  );
}

/**
 * Hook that provides the current Turnstile token for form submission.
 * Returns the token string or null if not yet verified.
 */
export function useTurnstileToken(siteKey: string | null) {
  const [token, setToken] = useState<string | null>(null);

  if (!siteKey) {
    return { token: null, siteKey: null, enabled: false };
  }

  return { token, setToken, siteKey, enabled: true };
}