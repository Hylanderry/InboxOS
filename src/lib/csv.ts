/** Parse CSV/TSV rows while preserving delimiters inside quoted fields. */
export function parseDelimitedCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const sample = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  const delimiter = candidates.reduce(
    (best, value) => {
      const count = sample.split(value).length - 1;
      return count > best.count ? { value, count } : best;
    },
    { value: ",", count: -1 },
  ).value;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function validateClientImportCount(count: number, max = 500): number {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Quantidade de registros inválida.");
  }
  if (count > max) {
    throw new Error(
      `O arquivo contém ${count} registros; o limite é ${max} por importação. Divida o CSV em arquivos menores para evitar perda de dados.`,
    );
  }
  return count;
}
