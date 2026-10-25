import { describe, expect, it } from "vitest";
import {
  createCaseSchema,
  publicEvidence,
  validateConsistency,
  generatedCaseSchema,
  type GeneratedCase,
} from "./index.js";

describe("shared contracts", () => {
  it("trims valid scenario and rejects short input", () => {
    expect(
      createCaseSchema.parse({
        scenario: `  ${"A fictional mystery seed ".repeat(2)}  `,
      }).scenario.length,
    ).toBeGreaterThanOrEqual(30);
    expect(() => createCaseSchema.parse({ scenario: "short" })).toThrow();
  });
  it("rejects oversized input, whitespace-only input, and invalid enum values", () => {
    const seed =
      "A fictional setting with an interesting object that went missing.";
    expect(() =>
      createCaseSchema.parse({ scenario: `${seed} `.repeat(30) }),
    ).toThrow();
    expect(() =>
      createCaseSchema.parse({ scenario: "                                 " }),
    ).toThrow();
    expect(() =>
      createCaseSchema.parse({ scenario: seed, difficulty: "impossible" }),
    ).toThrow();
  });
  it("removes internal clue metadata", () => {
    const result = publicEvidence({
      id: "e1",
      type: "document",
      title: "Note",
      summary: "A note",
      content: "Text",
      sourceLabel: "Desk",
      privateClueSignificance: "culprit was there",
      privateSupportsSuspectIds: ["s1"],
      privateContradictsSuspectIds: [],
    });
    expect(result).not.toHaveProperty("privateClueSignificance");
    expect(result).not.toHaveProperty("privateSupportsSuspectIds");
  });
  it("checks minimum evidence, support, and solution references", () => {
    const evidence = Array.from({ length: 7 }, (_, i) => ({
      id: `e${i}`,
      type: (i === 1 ? "chat" : "document") as "document" | "chat",
      title: "Record",
      summary: "Summary",
      content: "Content",
      sourceLabel: "Fictional source",
      privateClueSignificance: "Clue",
      privateSupportsSuspectIds: i < 3 ? ["s1"] : [],
      privateContradictsSuspectIds: [],
    }));
    const value = {
      title: "Case",
      setting: { location: "A fictional place", dateLabel: "Friday" },
      briefing: "Briefing",
      eventSummary: "Mystery",
      suspects: [1, 2, 3].map((i) => ({
        id: `s${i}`,
        displayName: `Person ${i}`,
        role: "Guest",
        profile: "Profile",
        publicMotive: "Motive",
        publicOpportunity: "Opportunity",
        alibi: "Alibi",
        publicDescription: "Description",
      })),
      timeline: [
        {
          id: "t1",
          time: "8 PM",
          event: "Record logged",
          relatedEvidenceIds: ["e0"],
        },
      ],
      evidence,
      hints: ["Compare the times", "Review the log", "Check the access record"],
      solution: {
        culpritSuspectId: "s1",
        motive: "Motive",
        methodSummary: "Method",
        explanation: "Explanation",
        chronologicalReconstruction: ["First", "Then"],
        evidenceLinks: ["e0", "e1", "e2"].map((evidenceId) => ({
          evidenceId,
          explanation: "Supports the timeline.",
        })),
        redHerrings: [{ evidenceId: "e3", explanation: "A fair distraction." }],
      },
    };
    const parsed = generatedCaseSchema.parse(value) as GeneratedCase;
    expect(() => validateConsistency(parsed, "standard")).not.toThrow();
    expect(() => validateConsistency(parsed, "extended")).toThrow(
      "Insufficient evidence",
    );
    const spoiler = {
      ...parsed,
      evidence: parsed.evidence.map((item, index) =>
        index === 0
          ? {
              ...item,
              content: `${parsed.suspects[0]!.displayName} stole the star chart.`,
            }
          : item,
      ),
    };
    expect(() => validateConsistency(spoiler, "standard")).toThrow(
      "Public evidence directly identifies the culprit",
    );
  });
});
