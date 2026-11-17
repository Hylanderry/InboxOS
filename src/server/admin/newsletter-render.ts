export type NewsletterBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "image"; src: string; alt: string }
  | { type: "video"; href: string; thumbnail: string; title: string }
  | { type: "button"; href: string; label: string }
  | { type: "divider" };
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
/** Restrict HTML to structured blocks; never inject arbitrary user HTML. */
export function renderNewsletter(blocks: NewsletterBlock[]) {
  const body = blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:34px;color:#18181b;padding-top:16px;padding-bottom:14px;font-weight:bold">${escape(b.text)}</td></tr>`;
        case "paragraph":
          return `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#3f3f46;padding-bottom:16px">${escape(b.text).replace(/\n/g, "<br>")}</td></tr>`;
        case "image":
          return `<tr><td style="padding-bottom:16px"><img alt="${escape(b.alt)}" src="${escape(b.src)}" width="560" height="auto" border="0" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>`;
        case "video":
          return `<tr><td style="padding-bottom:16px"><a href="${escape(b.href)}" rel="noopener noreferrer"><img alt="${escape(b.title)} — assistir ao vídeo" src="${escape(b.thumbnail)}" width="560" height="auto" border="0" style="display:block;width:100%;max-width:560px;height:auto;border:0"></a><p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#3f3f46"><a href="${escape(b.href)}">${escape(b.title)} — assistir</a></p></td></tr>`;
        case "button":
          return `<tr><td style="padding-bottom:20px"><a href="${escape(b.href)}" style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;padding-top:12px;padding-bottom:12px;padding-left:20px;padding-right:20px;border-radius:6px">${escape(b.label)}</a></td></tr>`;
        case "divider":
          return `<tr><td style="padding-top:14px;padding-bottom:14px;border-top:1px solid #e4e4e7"></td></tr>`;
      }
    })
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"></head><body style="margin:0;background-color:#f4f4f5"><table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f4f4f5"><tr><td align="center" style="padding-top:24px;padding-bottom:24px"><table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff"><tr><td style="padding-top:20px;padding-bottom:20px;padding-left:20px;padding-right:20px"><table cellpadding="0" cellspacing="0" border="0" width="100%">${body}<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:18px;color:#71717a;padding-top:16px">Para deixar de receber e-mails, <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">cancelar inscrição</a>.</td></tr></table></td></tr></table></td></tr></table></body></html>`;
}
