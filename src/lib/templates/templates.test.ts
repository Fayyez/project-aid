import { describe, expect, it } from "vitest";
import type { ReportKind } from "../types";
import { DEFAULT_TEMPLATES, TEMPLATE_LABELS, renderTemplate, templatePlaceholders } from "./index";

const KNOWN_PLACEHOLDERS = [
  "project_name",
  "client",
  "period",
  "date",
  "prepared_by",
  "health",
  "progress_pct",
  "pace_status",
  "incident_key",
  "severity",
];

describe("renderTemplate", () => {
  it("replaces placeholders with or without inner spaces", () => {
    expect(renderTemplate("{{a}} {{ b }} {{  c  }}", { a: "x", b: "y", c: 3 })).toBe("x y 3");
  });

  it("keeps zero values and replaces every occurrence", () => {
    expect(renderTemplate("{{n}} of {{n}}", { n: 0 })).toBe("0 of 0");
  });

  it("leaves unknown and undefined placeholders as written", () => {
    expect(renderTemplate("{{a}} {{b}} {{zz}}", { a: "1", b: undefined })).toBe("1 {{b}} {{zz}}");
  });

  it("does not treat object prototype names as values", () => {
    expect(renderTemplate("{{constructor}} {{toString}}", {})).toBe("{{constructor}} {{toString}}");
  });

  it("inserts values literally, without replacement patterns", () => {
    expect(renderTemplate("{{a}}", { a: "$& $1" })).toBe("$& $1");
  });
});

describe("templatePlaceholders", () => {
  it("returns unique names in order of first appearance", () => {
    expect(templatePlaceholders("{{b}} {{a}} {{ b }} {{c}} {{a}}")).toEqual(["b", "a", "c"]);
  });

  it("returns an empty list when there are no placeholders", () => {
    expect(templatePlaceholders("plain text")).toEqual([]);
  });
});

describe("DEFAULT_TEMPLATES", () => {
  const headings = (template: string) => template.split("\n").filter((line) => line.startsWith("## ")).map((line) => line.slice(3));

  it("has the expected sections for each report kind", () => {
    expect(headings(DEFAULT_TEMPLATES.progress)).toEqual([
      "Executive summary",
      "Status at a glance",
      "What was delivered",
      "In progress",
      "Risks and blockers",
      "Decisions needed from the client",
      "Next period plan",
    ]);
    expect(headings(DEFAULT_TEMPLATES.incident)).toEqual([
      "Summary",
      "Impact",
      "Timeline",
      "Root cause",
      "Resolution",
      "What went well / what did not",
      "Follow-up actions",
    ]);
    expect(headings(DEFAULT_TEMPLATES.release_notes)).toEqual([
      "Highlights",
      "New features",
      "Improvements",
      "Fixes",
      "Known issues",
      "Upgrade notes",
    ]);
  });

  it("puts an HTML comment directly under every heading", () => {
    for (const kind of Object.keys(DEFAULT_TEMPLATES) as ReportKind[]) {
      const lines = DEFAULT_TEMPLATES[kind].split("\n");
      lines.forEach((line, index) => {
        if (!line.startsWith("## ")) return;
        const next = lines.slice(index + 1).find((l) => l.trim() !== "");
        expect(next?.trim().startsWith("<!--"), `${kind}: ${line}`).toBe(true);
      });
    }
  });

  it("only uses known placeholders", () => {
    for (const kind of Object.keys(DEFAULT_TEMPLATES) as ReportKind[]) {
      for (const name of templatePlaceholders(DEFAULT_TEMPLATES[kind])) {
        expect(KNOWN_PLACEHOLDERS).toContain(name);
      }
    }
  });

  it("renders fully when every known value is supplied", () => {
    const vars = {
      project_name: "Atlas",
      client: "Acme",
      period: "Oct 2026",
      date: "2026-11-16",
      prepared_by: "Dana",
      health: "amber",
      progress_pct: 42,
      pace_status: "at_risk",
      incident_key: "INC-7",
      severity: "SEV2",
    };
    for (const kind of Object.keys(DEFAULT_TEMPLATES) as ReportKind[]) {
      expect(renderTemplate(DEFAULT_TEMPLATES[kind], vars)).not.toMatch(/\{\{/);
    }
  });

  it("has a label and description for every report kind", () => {
    expect(Object.keys(TEMPLATE_LABELS).sort()).toEqual(["incident", "progress", "release_notes"]);
    for (const entry of Object.values(TEMPLATE_LABELS)) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});
