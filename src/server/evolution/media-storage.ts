const extensionByMime: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/ogg": "ogg",
  "audio/ogg; codecs=opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/aac": "aac",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
};

function safeFileName(value: string | null | undefined): string {
  const cleaned = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return cleaned || "arquivo.bin";
}

function extensionFor(mimetype?: string | null, filename?: string | null): string {
  const safeName = safeFileName(filename);
  const fromName = safeName.includes(".") ? safeName.split(".").pop() : null;
  if (fromName && /^[a-z0-9]{1,12}$/i.test(fromName)) return fromName.toLowerCase();
  const mime = (mimetype ?? "").toLowerCase();
  return extensionByMime[mime] ?? (mime.split("/")[1] ?? "bin").split(";")[0] ?? "bin";
}

/**
 * Builds a private, tenant-scoped path for chat media.
 * The workspace prefix is required by the authenticated media route and also
 * prevents two workspaces from ever sharing a storage namespace by accident.
 */
export function buildMediaStoragePath(
  workspaceId: string,
  mimetype?: string | null,
  filename?: string | null,
  folder = "chat",
): string {
  const workspace = workspaceId.trim();
  if (
    !workspace ||
    workspace.includes("/") ||
    workspace.includes("\\") ||
    workspace.includes("..")
  ) {
    throw new Error("Workspace inválido para armazenamento de mídia");
  }
  const normalizedFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "") || "chat";
  const ext = extensionFor(mimetype, filename);
  const token = Math.random().toString(36).slice(2, 8);
  return `${workspace}/${normalizedFolder}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${token}.${ext}`;
}
