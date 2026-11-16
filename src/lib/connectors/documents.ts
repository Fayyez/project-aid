import type { ParsedDocument } from "./types";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS_PER_SHEET = 200;
const SUPPORTED = ["docx", "xlsx", "csv", "md", "txt", "json"] as const;
type Format = (typeof SUPPORTED)[number];

function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function titleOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).trim() || "Untitled";
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s*\n\s*/g, " ").replace(/\|/g, "/");
}

async function parseXlsx(buffer: Buffer): Promise<{ text: string; meta: Record<string, string> }> {
  const { default: readExcelFile } = await import("read-excel-file/node");
  const sheets = await readExcelFile(buffer);
  const meta: Record<string, string> = { sheets: sheets.map((s) => s.sheet).join(", ") };
  const parts: string[] = [];
  for (const { sheet, data } of sheets) {
    const rows = (data as unknown[][]).slice(0, MAX_ROWS_PER_SHEET);
    if (data.length > MAX_ROWS_PER_SHEET) meta[`truncated:${sheet}`] = `showing ${MAX_ROWS_PER_SHEET} of ${data.length} rows`;
    const lines = rows.map((row) => row.map(cell).join(" | "));
    parts.push(`## ${sheet}\n${lines.join("\n")}`);
  }
  return { text: parts.join("\n\n"), meta };
}

export async function parseDocument(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  const ext = extensionOf(filename);
  if (!(SUPPORTED as readonly string[]).includes(ext)) {
    throw new Error(`Unsupported file type ".${ext}". Supported: ${SUPPORTED.map((e) => `.${e}`).join(", ")}.`);
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error(`File is too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). The limit is 5 MB.`);
  }
  const format = ext as Format;
  const title = titleOf(filename);
  const meta: Record<string, string> = { bytes: String(buffer.length) };
  let text: string;
  try {
    switch (format) {
      case "docx": {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
        if (result.messages.length > 0) meta.warnings = String(result.messages.length);
        break;
      }
      case "xlsx": {
        const parsed = await parseXlsx(buffer);
        text = parsed.text;
        Object.assign(meta, parsed.meta);
        break;
      }
      case "json": {
        const raw = buffer.toString("utf8");
        try {
          text = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          throw new Error("The JSON file is not valid JSON.");
        }
        break;
      }
      default:
        text = buffer.toString("utf8");
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("The JSON")) throw err;
    throw new Error(`Could not read the ${format} file; it may be corrupt or password protected.`);
  }
  return { title, text: text.replace(/^﻿/, "").trim(), format, meta };
}
