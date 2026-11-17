type PreviewBlock = {
  type: string;
  text?: string;
  src?: string;
  alt?: string;
  title?: string;
  thumbnail?: string;
  label?: string;
};

/** Preview structural only; the server renderer remains the source of truth. */
export function NewsletterPreview({
  blocks,
  subject,
}: {
  blocks: PreviewBlock[];
  subject: string;
}) {
  return (
    <aside
      className="rounded-2xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.025] sm:p-4"
      aria-label="Prévia aproximada do e-mail"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Prévia aproximada</h4>
        <span className="text-xs text-zinc-500">Sem enviar</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-700 dark:bg-zinc-900 sm:p-4">
        <div className="mx-auto max-w-[560px] overflow-hidden rounded-lg bg-white p-4 text-zinc-900 shadow-sm sm:p-5">
          <p className="mb-4 border-b border-zinc-100 pb-3 text-xs text-zinc-500">
            Assunto: {subject || "Assunto da campanha"}
          </p>
          {blocks.map((block, index) => {
            if (block.type === "heading") {
              return (
                <h5 key={index} className="mb-3 break-words text-[22px] font-bold leading-tight">
                  {block.text || "Título do bloco"}
                </h5>
              );
            }
            if (block.type === "paragraph") {
              return (
                <p
                  key={index}
                  className="mb-4 whitespace-pre-line break-words text-[14px] leading-relaxed text-zinc-700"
                >
                  {block.text || "Parágrafo sem conteúdo"}
                </p>
              );
            }
            if (block.type === "image") {
              return block.src?.startsWith("https://") ? (
                <img
                  key={index}
                  src={block.src}
                  alt={block.alt || "Imagem da campanha"}
                  loading="lazy"
                  className="mb-4 h-auto max-w-full rounded-md"
                />
              ) : (
                <p key={index} className="mb-4 rounded-lg bg-zinc-100 p-3 text-xs text-zinc-500">
                  Imagem: informe uma URL HTTPS
                </p>
              );
            }
            if (block.type === "video") {
              return (
                <div key={index} className="mb-4 rounded-lg border border-zinc-200 p-3">
                  {block.thumbnail?.startsWith("https://") && (
                    <img
                      src={block.thumbnail}
                      alt="Capa do vídeo"
                      loading="lazy"
                      className="mb-2 h-auto max-w-full rounded-md"
                    />
                  )}
                  <p className="text-sm font-semibold">▶ {block.title || "Assista ao vídeo"}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Vídeo abre por link no e-mail enviado
                  </p>
                </div>
              );
            }
            if (block.type === "button") {
              return (
                <div key={index} className="mb-4">
                  <span className="inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
                    {block.label || "Botão"}
                  </span>
                </div>
              );
            }
            if (block.type === "divider")
              return <hr key={index} className="my-4 border-zinc-200" />;
            return null;
          })}
          <p className="mt-6 border-t border-zinc-200 pt-3 text-[11px] text-zinc-500">
            Rodapé com link de cancelamento de inscrição fornecido no envio.
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        A prévia representa a estrutura. Clientes de e-mail podem renderizar fontes e larguras de
        forma diferente.
      </p>
    </aside>
  );
}
