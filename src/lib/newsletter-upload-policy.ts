/**
 * Media sent through the Vercel Function must remain below its 4.5 MB request
 * limit. Keep a generous multipart/encoding margin.
 * Larger assets require a separately reviewed direct-to-storage upload flow.
 */
export const MAX_NEWSLETTER_FUNCTION_UPLOAD_BYTES = 3 * 1024 * 1024;
export const NEWSLETTER_MEDIA_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
] as const;

export function isAllowedNewsletterMedia(type: string, size: number): boolean {
  return (
    Number.isSafeInteger(size) &&
    size > 0 &&
    size <= MAX_NEWSLETTER_FUNCTION_UPLOAD_BYTES &&
    NEWSLETTER_MEDIA_MIME_TYPES.some((mime) => mime === type)
  );
}
