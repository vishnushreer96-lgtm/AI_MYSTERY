import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import request from "supertest";
import { app } from "./app.js";
import { MysteryCaseModel } from "./models/MysteryCase.js";
import { MockGenerator } from "./services/generation.js";

describe("API boundary", () => {
  it("returns a safe health envelope and request ID", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ok");
    expect(response.body.requestId).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toContain("MONGODB_URI");
  });
  it("rejects invalid creation input before calling generation", async () => {
    const response = await request(app)
      .post("/api/v1/cases")
      .send({ scenario: "too short", ignored: true });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
  it("does not expose details for an invalid or missing case ID", async () => {
    const response = await request(app).get("/api/v1/cases/not-a-case");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
  it("stores a validated mystery before returning a spoiler-safe case", async () => {
    const save = vi.spyOn(MysteryCaseModel, "create").mockResolvedValue({
      _id: { toString: () => "507f1f77bcf86cd799439011" },
    } as never);
    try {
      const response = await request(app).post("/api/v1/cases").send({
        scenario:
          "A fictional star chart disappears from a quiet observatory before a demonstration.",
      });
      expect(response.status).toBe(201);
      expect(response.body.data.caseId).toBe("507f1f77bcf86cd799439011");
      expect(response.body.data.case.evidence).toHaveLength(7);
      const serialized = JSON.stringify(response.body.data.case);
      expect(serialized).not.toContain("culpritSuspectId");
      expect(serialized).not.toContain("privateClueSignificance");
      expect(save).toHaveBeenCalledOnce();
    } finally {
      save.mockRestore();
    }
  });
  it("returns public-only evidence and withholds reveal until accusation", async () => {
    const generated = await new MockGenerator().generate({
      scenario: "A fictional star chart disappears from a quiet observatory.",
      difficulty: "medium",
      tone: "classic_detective",
      length: "short",
    });
    const doc = {
      ...generated,
      _id: "507f1f77bcf86cd799439011",
      status: "ready",
      tone: "classic_detective",
      difficulty: "medium",
      length: "short",
    };
    const find = vi
      .spyOn(MysteryCaseModel, "findById")
      .mockReturnValue({ lean: () => Promise.resolve(doc) } as never);
    try {
      const evidence = await request(app).get(
        "/api/v1/cases/507f1f77bcf86cd799439011/evidence/evidence_1",
      );
      expect(evidence.status).toBe(200);
      expect(evidence.body.data).not.toHaveProperty("privateClueSignificance");
      const reveal = await request(app).get(
        "/api/v1/cases/507f1f77bcf86cd799439011/reveal",
      );
      expect(reveal.status).toBe(403);
      expect(JSON.stringify(reveal.body)).not.toContain(
        generated.solution.culpritSuspectId,
      );
    } finally {
      find.mockRestore();
    }
  });
  it("scores the final accusation against the stored answer and does not allow overwrites", async () => {
    const generated = await new MockGenerator().generate({
      scenario: "A fictional star chart disappears from a quiet observatory.",
      difficulty: "medium",
      tone: "classic_detective",
      length: "short",
    });
    const id = "507f1f77bcf86cd799439011";
    const completed = {
      ...generated,
      _id: id,
      status: "completed",
      tone: "classic_detective",
      difficulty: "medium",
      length: "short",
      accusation: { suspectId: "suspect_1" },
    };
    const update = vi
      .spyOn(MysteryCaseModel, "findOneAndUpdate")
      .mockReturnValue({ lean: () => Promise.resolve(completed) } as never);
    try {
      const response = await request(app)
        .post(`/api/v1/cases/${id}/accusation`)
        .send({ suspectId: "suspect_1" });
      expect(response.status).toBe(200);
      expect(response.body.data.correct).toBe(true);
      const pipeline = update.mock.calls[0]?.[1] as Array<{
        $set: { accusation: { correct: { $eq: unknown[] } } };
      }>;
      expect(pipeline[0]?.$set.accusation.correct.$eq).toEqual([
        "suspect_1",
        "$solution.culpritSuspectId",
      ]);
      update.mockReturnValueOnce({
        lean: () => Promise.resolve(null),
      } as never);
      const find = vi
        .spyOn(MysteryCaseModel, "findById")
        .mockReturnValue({ lean: () => Promise.resolve(completed) } as never);
      const second = await request(app)
        .post(`/api/v1/cases/${id}/accusation`)
        .send({ suspectId: "suspect_2" });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("CASE_ALREADY_COMPLETED");
      find.mockRestore();
    } finally {
      update.mockRestore();
    }
  });
});
