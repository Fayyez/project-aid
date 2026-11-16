import { describe, expect, it } from "vitest";
import { parseDocument } from "./documents";

describe("parseDocument", () => {
  it("parses markdown, csv and json", async () => {
    const md = await parseDocument(Buffer.from("# Plan\n\nShip it."), "notes/plan.md");
    expect(md).toMatchObject({ title: "plan", format: "md", text: "# Plan\n\nShip it." });
    const csv = await parseDocument(Buffer.from("a,b\n1,2\n"), "data.CSV");
    expect(csv.format).toBe("csv");
    expect(csv.text).toContain("1,2");
    const json = await parseDocument(Buffer.from('{"a":1}'), "x.json");
    expect(json.text).toContain('"a": 1');
  });

  it("rejects unsupported extensions, oversized files and bad json", async () => {
    await expect(parseDocument(Buffer.from("x"), "run.exe")).rejects.toThrow(/Unsupported file type/);
    await expect(parseDocument(Buffer.alloc(5 * 1024 * 1024 + 1), "big.txt")).rejects.toThrow(/too large/);
    await expect(parseDocument(Buffer.from("{"), "bad.json")).rejects.toThrow(/not valid JSON/);
  });

  it("reports unreadable office files with a clear error", async () => {
    await expect(parseDocument(Buffer.from("not a zip"), "a.docx")).rejects.toThrow(/Could not read/);
    await expect(parseDocument(Buffer.from("not a zip"), "a.xlsx")).rejects.toThrow(/Could not read/);
  });
});
