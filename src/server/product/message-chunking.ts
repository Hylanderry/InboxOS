const DEFAULT_MAX_CHARS = 900;

function codeAwareBoundaries(text: string): number[] {
  const boundaries: number[] = [];
  let inCode = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "`" && text[index - 1] !== "\\") inCode = !inCode;
    if (!inCode && /[.!?;\n]/.test(text[index] ?? "")) boundaries.push(index + 1);
  }
  return boundaries;
}

export function splitNaturalMessage(input: string, maxChars = DEFAULT_MAX_CHARS): string[] {
  const text = input.trim();
  const limit = Math.max(1, Math.floor(maxChars));
  if (!text) return [];
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const boundaries = codeAwareBoundaries(remaining).filter((index) => index <= limit);
    let cut = boundaries.at(-1) ?? -1;
    if (cut < Math.floor(limit * 0.45)) {
      const chars = [...remaining.slice(0, limit)];
      let whitespace = -1;
      for (let index = chars.length - 1; index >= 0; index -= 1) {
        if (/\s/.test(chars[index] ?? "")) {
          whitespace = index;
          break;
        }
      }
      cut = whitespace > 0 ? whitespace : limit;
    }
    const chunk = remaining.slice(0, cut).trim();
    if (!chunk) break;
    chunks.push(chunk);
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function estimateTypingDelayMs(text: string): number {
  const normalizedLength = [...text.trim()].length;
  return Math.min(4_500, Math.max(500, Math.round(normalizedLength * 35)));
}
