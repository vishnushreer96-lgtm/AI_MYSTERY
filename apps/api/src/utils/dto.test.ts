import { describe, expect, it } from "vitest";
import { MockGenerator } from "../services/generation.js";
import { caseDto, revealDto } from "./dto.js";

describe("spoiler boundaries", () => {
  it("omits culprit and internal evidence metadata from case DTO", async () => {
    const game = await new MockGenerator().generate({
      scenario: "A fictional seed that describes a lost observatory artifact",
      difficulty: "medium",
      tone: "classic_detective",
      length: "short",
    });
    const json = JSON.stringify(
      caseDto({
        ...game,
        tone: "classic_detective",
        difficulty: "medium",
        length: "short",
      }),
    );
    expect(json).not.toContain("culpritSuspectId");
    expect(json).not.toContain("privateClueSignificance");
  });
  it("scored accusation returns canonical reveal", async () => {
    const game = await new MockGenerator().generate({
      scenario: "A fictional seed that describes a lost observatory artifact",
      difficulty: "medium",
      tone: "classic_detective",
      length: "short",
    });
    expect(revealDto(game, "suspect_1").correct).toBe(true);
    expect(revealDto(game, "suspect_2").correct).toBe(false);
  });
});
