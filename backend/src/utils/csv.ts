/** RFC 4180-ish CSV builder: quotes, escapes embedded delimiters/newlines/quotes. */
const escapeCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return escapeCell(JSON.stringify(value));

  const text = String(value);
  // Guard against CSV/formula injection in spreadsheet applications.
  const formulaSafe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  if (/[",\n\r]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
};

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export const toCsv = <T>(columns: CsvColumn<T>[], rows: T[]): string => {
  const header = columns.map((column) => escapeCell(column.header)).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCell(column.value(row))).join(','));
  return [header, ...body].join('\r\n');
};

export const csvFilename = (base: string, type: string, date = new Date()): string => {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const safeBase = base.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
  return `${safeBase}-${type}-${stamp}.csv`;
};
