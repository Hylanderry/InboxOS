/**
 * Small, dependency-free first-line file signature check for newsletter assets.
 * MIME values are supplied by the caller and cannot be trusted on their own.
 * This does not replace antivirus scanning or full media decoding.
 */
export type NewsletterMediaType =
  "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "video/mp4" | "video/webm";

const startsWith = (buffer: Uint8Array, header: readonly number[], offset = 0): boolean =>
  buffer.length >= offset + header.length &&
  header.every((n, index) => buffer[offset + index] === n);

const ascii = (buffer: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...buffer.subarray(start, start + length));

export function isNewsletterMediaSignatureValid(mimeType: string, bytes: Uint8Array): boolean {
  switch (mimeType) {
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/webp":
      return bytes.length >= 16 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    case "image/gif":
      return bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6));
    case "video/mp4": {
      if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return false;
      const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
        0,
        false,
      );
      const brand = ascii(bytes, 8, 4);
      // Reject files with invalid initial box sizes and image-only ISO BMFF brands.
      return (
        size >= 16 && !["heic", "heix", "hevc", "mif1", "msf1", "avif", "avis"].includes(brand)
      );
    }
    case "video/webm": {
      if (!startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return false;
      // WebM files declare the EBML DocType within the header. Do not accept
      // arbitrary Matroska/EBML content relabeled as video/webm.
      for (let i = 4; i <= Math.min(bytes.length, 4096) - 7; i++) {
        // EBML DocType (42 82) with 4-byte VINT payload (84 = length 4).
        if (startsWith(bytes, [0x42, 0x82, 0x84], i) && ascii(bytes, i + 3, 4) === "webm") {
          return true;
        }
      }
      return false;
    }
    default:
      return false;
  }
}
