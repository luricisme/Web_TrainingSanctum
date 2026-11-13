/**
 * File → grid of text cells for Import → Upload file (spec-3-2). Runs in the
 * browser: the file bytes never leave it, only the grid is sent to
 * `POST /api/import/parse`. `.csv` is decoded as UTF-8 and parsed by the
 * domain `parseCsv`; `.xlsx` is read with `read-excel-file`, loaded on demand
 * so the panel bundle does not grow, and only its first sheet is imported.
 */
import {
  IMPORT_FILE_CELL_MESSAGE,
  IMPORT_FILE_COLUMNS_MESSAGE,
  IMPORT_FILE_EMPTY_MESSAGE,
  IMPORT_FILE_ENCODING_MESSAGE,
  IMPORT_FILE_SIZE_MESSAGE,
  IMPORT_FILE_TYPE_MESSAGE,
  IMPORT_GRID_ROWS_MESSAGE,
  MAX_IMPORT_CELL_LENGTH,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_GRID_COLUMNS,
  MAX_IMPORT_GRID_ROWS,
  gridColumnCount,
  parseCsv,
} from "@training-sanctum/domain";

export const XLSX_UNREADABLE_MESSAGE =
  "This file could not be read. Save it as .xlsx and try again.";

/** A file read into text cells. `sheetName` is set for `.xlsx` only. */
export interface Spreadsheet {
  fileName: string;
  sheetName: string | null;
  grid: string[][];
}

export type ReadSpreadsheetResult =
  | { ok: true; spreadsheet: Spreadsheet }
  | { ok: false; message: string };

type FileKind = "csv" | "xlsx";

function kindOf(name: string): FileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx")) return "xlsx";
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * An xlsx cell as the text a spreadsheet shows. Numbers keep the text stored
 * in the file (read with `parseNumber: s => s`), dates read as YYYY-MM-DD
 * (plus HH:MM when they carry a time), booleans as TRUE / FALSE.
 */
export function xlsxCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const day = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(
      value.getUTCDate()
    )}`;
    const h = value.getUTCHours();
    const m = value.getUTCMinutes();
    return h === 0 && m === 0 ? day : `${day} ${pad(h)}:${pad(m)}`;
  }
  return String(value);
}

/** Drops trailing blank rows and cells beyond the last used column. */
function tidy(grid: string[][]): string[][] {
  const columns = gridColumnCount(grid);
  const rows = grid.map((row) => row.slice(0, columns));
  let end = rows.length;
  while (end > 0 && rows[end - 1]!.every((cell) => cell.trim() === "")) end--;
  return rows.slice(0, end);
}

async function readXlsx(file: Blob): Promise<{ sheetName: string; grid: string[][] } | null> {
  try {
    const { default: readXlsxFile } = await import("read-excel-file/universal");
    const sheets = await readXlsxFile(file, { parseNumber: (s: string) => s, trim: false });
    const first = sheets[0];
    if (!first) return null;
    return {
      sheetName: first.sheet,
      grid: first.data.map((row) => row.map((cell) => xlsxCellText(cell))),
    };
  } catch {
    return null;
  }
}

export const FILE_UNREADABLE_MESSAGE = "This file could not be read. Try again.";

/**
 * Reads a chosen or dropped file; every failure is a user-facing message.
 * Never rejects.
 */
export async function readSpreadsheet(file: File): Promise<ReadSpreadsheetResult> {
  try {
    return await read(file);
  } catch {
    return {
      ok: false,
      message: kindOf(file.name) === "xlsx" ? XLSX_UNREADABLE_MESSAGE : FILE_UNREADABLE_MESSAGE,
    };
  }
}

async function read(file: File): Promise<ReadSpreadsheetResult> {
  const kind = kindOf(file.name);
  if (!kind) return { ok: false, message: IMPORT_FILE_TYPE_MESSAGE };
  if (file.size > MAX_IMPORT_FILE_BYTES) return { ok: false, message: IMPORT_FILE_SIZE_MESSAGE };

  let grid: string[][];
  let sheetName: string | null = null;
  if (kind === "csv") {
    const bytes = await file.arrayBuffer();
    let text: string;
    try {
      // Fatal: only bytes that are not UTF-8 fail; a real U+FFFD in the file is kept.
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return { ok: false, message: IMPORT_FILE_ENCODING_MESSAGE };
    }
    grid = parseCsv(text);
  } else {
    const sheet = await readXlsx(file);
    if (!sheet) return { ok: false, message: XLSX_UNREADABLE_MESSAGE };
    grid = sheet.grid;
    sheetName = sheet.sheetName;
  }

  grid = tidy(grid);
  if (grid.length === 0) return { ok: false, message: IMPORT_FILE_EMPTY_MESSAGE };
  if (grid.length > MAX_IMPORT_GRID_ROWS) return { ok: false, message: IMPORT_GRID_ROWS_MESSAGE };
  if (gridColumnCount(grid) > MAX_IMPORT_GRID_COLUMNS) {
    return { ok: false, message: IMPORT_FILE_COLUMNS_MESSAGE };
  }
  if (grid.some((row) => row.some((cell) => cell.length > MAX_IMPORT_CELL_LENGTH))) {
    return { ok: false, message: IMPORT_FILE_CELL_MESSAGE };
  }
  return { ok: true, spreadsheet: { fileName: file.name, sheetName, grid } };
}
