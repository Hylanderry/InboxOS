function platformBrandName() {
  const configured = process.env["PLATFORM_BRAND_NAME"]?.trim();
  const value = configured || "InboxOS";
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? "";
  });
}

export function renderErrorPage(): string {
  const brand = platformBrandName();
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Não foi possível carregar esta página · ${brand}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: #ffffff;
        color: #18181b;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        min-height: 100dvh;
        margin: 0;
        padding: 1.5rem;
        -webkit-font-smoothing: antialiased;
      }
      .card {
        max-width: 28rem;
        width: 100%;
        text-align: center;
        padding: 2.5rem 2rem;
        border-radius: 1.5rem;
        border: 1px solid #e4e4e7;
        background: #ffffff;
        box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.07);
      }
      .badge {
        display: inline-block;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #71717a;
        margin-bottom: 0.5rem;
      }
      h1 {
        font-size: 1.35rem;
        font-weight: 700;
        color: #18181b;
        margin: 0 0 0.5rem;
        line-height: 1.3;
      }
      p {
        color: #52525b;
        font-size: 0.875rem;
        line-height: 1.5;
        margin: 0 0 1.75rem;
      }
      .actions {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
        flex-direction: column;
      }
      @media (min-width: 480px) {
        .actions {
          flex-direction: row;
        }
      }
      a, button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0.625rem 1.25rem;
        border-radius: 0.75rem;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        transition: all 140ms ease;
        border: 1px solid transparent;
      }
      .primary {
        background: #18181b;
        color: #ffffff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      }
      .primary:hover {
        background: #09090b;
      }
      .secondary {
        background: #ffffff;
        color: #3f3f46;
        border-color: #e4e4e7;
      }
      .secondary:hover {
        background: #f4f4f5;
        color: #18181b;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <span class="badge">Status do Sistema</span>
      <h1>Não foi possível carregar esta página</h1>
      <p>Ocorreu uma instabilidade ou erro inesperado. Tente novamente ou retorne ao início seguro.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Tentar novamente</button>
        <a class="secondary" href="/">Voltar ao início</a>
      </div>
    </div>
  </body>
</html>`;
}
