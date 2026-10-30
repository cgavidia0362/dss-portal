import * as XLSX from 'xlsx';

export function joinNotesForExcel(
  notes: Array<{ noteText?: string | null; createdByName?: string | null }>,
): string {
  return notes
    .map((n) => {
      const text = (n.noteText || '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      const who = (n.createdByName || '').trim();
      return who ? `${who}: ${text}` : text;
    })
    .filter(Boolean)
    .join(' | ');
}

export function buildExcelWorkbook(
  rows: Record<string, string | number>[],
  sheetName: string,
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return wb;
}

export function exportRowsToExcel(
  rows: Record<string, string | number>[],
  sheetName: string,
  filename: string,
) {
  if (rows.length === 0) return;
  const wb = buildExcelWorkbook(rows, sheetName);
  const name = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, name);
}
