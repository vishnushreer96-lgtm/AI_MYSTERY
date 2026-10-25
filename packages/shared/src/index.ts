import { z } from "zod";

export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export const toneSchema = z.enum([
  "classic_detective",
  "suspense",
  "lighthearted",
  "sci_fi",
]);
export const lengthSchema = z.enum(["short", "standard", "extended"]);
export const evidenceTypeSchema = z.enum([
  "chat",
  "image",
  "cctv",
  "document",
  "witness_statement",
  "physical_clue",
  "timeline_record",
]);
export const createCaseSchema = z
  .object({
    scenario: z.string().trim().min(30).max(1500),
    difficulty: difficultySchema.default("medium"),
    tone: toneSchema.default("classic_detective"),
    length: lengthSchema.default("standard"),
  })
  .strict();
export const hintSchema = z
  .object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) })
  .strict();
export const accusationSchema = z
  .object({ suspectId: z.string().min(1).max(64) })
  .strict();

export const suspectSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  role: z.string(),
  profile: z.string(),
  publicMotive: z.string(),
  publicOpportunity: z.string(),
  alibi: z.string(),
  publicDescription: z.string(),
});
export const timelineEventSchema = z.object({
  id: z.string(),
  time: z.string(),
  event: z.string(),
  relatedEvidenceIds: z.array(z.string()),
});
export const evidenceSchema = z.object({
  id: z.string(),
  type: evidenceTypeSchema,
  title: z.string(),
  summary: z.string(),
  content: z.string(),
  sourceLabel: z.string(),
  occurredAt: z.string().optional(),
  timeRange: z.object({ start: z.string(), end: z.string() }).optional(),
  visual: z
    .object({
      status: z.enum(["not_requested", "pending", "ready", "unavailable"]),
      provider: z.string().optional(),
      assetUrl: z.string().url().optional(),
      altText: z.string().optional(),
      simulated: z.boolean().optional(),
    })
    .optional(),
  privateClueSignificance: z.string(),
  privateSupportsSuspectIds: z.array(z.string()),
  privateContradictsSuspectIds: z.array(z.string()),
});
export const generatedCaseSchema = z.object({
  title: z.string(),
  setting: z.object({ location: z.string(), dateLabel: z.string() }),
  briefing: z.string(),
  eventSummary: z.string(),
  suspects: z.array(suspectSchema).min(3).max(5),
  timeline: z.array(timelineEventSchema).min(1),
  evidence: z.array(evidenceSchema).min(1),
  hints: z.tuple([z.string(), z.string(), z.string()]),
  solution: z.object({
    culpritSuspectId: z.string(),
    motive: z.string(),
    methodSummary: z.string(),
    explanation: z.string(),
    chronologicalReconstruction: z.array(z.string()).min(1),
    evidenceLinks: z
      .array(z.object({ evidenceId: z.string(), explanation: z.string() }))
      .min(3),
    redHerrings: z
      .array(z.object({ evidenceId: z.string(), explanation: z.string() }))
      .min(1),
  }),
});

export type Difficulty = z.infer<typeof difficultySchema>;
export type CaseTone = z.infer<typeof toneSchema>;
export type CaseLength = z.infer<typeof lengthSchema>;
export type Suspect = z.infer<typeof suspectSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type GeneratedCase = z.infer<typeof generatedCaseSchema>;
export const evidenceMinimum: Record<CaseLength, number> = {
  short: 5,
  standard: 7,
  extended: 9,
};

export function validateConsistency(
  game: GeneratedCase,
  length: CaseLength,
): void {
  const suspectIds = game.suspects.map((s) => s.id);
  const evidenceIds = game.evidence.map((e) => e.id);
  const timelineIds = game.timeline.map((event) => event.id);
  if (
    new Set(suspectIds).size !== suspectIds.length ||
    new Set(evidenceIds).size !== evidenceIds.length
  )
    throw new Error("Duplicate case IDs");
  if (new Set(timelineIds).size !== timelineIds.length)
    throw new Error("Duplicate timeline IDs");
  if (!suspectIds.includes(game.solution.culpritSuspectId))
    throw new Error("Unknown culprit");
  if (game.evidence.length < evidenceMinimum[length])
    throw new Error("Insufficient evidence");
  if (
    game.solution.evidenceLinks.length < 3 ||
    game.solution.evidenceLinks.some((x) => !evidenceIds.includes(x.evidenceId))
  )
    throw new Error("Invalid solution evidence links");
  if (
    game.solution.redHerrings.some((x) => !evidenceIds.includes(x.evidenceId))
  )
    throw new Error("Invalid red herring evidence link");
  if (
    game.timeline.some((t) =>
      t.relatedEvidenceIds.some((id) => !evidenceIds.includes(id)),
    )
  )
    throw new Error("Invalid timeline evidence link");
  if (new Set(game.evidence.map((e) => e.type)).size < 2)
    throw new Error("Cases need multiple evidence formats");
  const supported = game.evidence.filter((e) =>
    e.privateSupportsSuspectIds.includes(game.solution.culpritSuspectId),
  );
  if (supported.length < 3)
    throw new Error("At least three evidence items must support the solution");
  const supportedIds = new Set(supported.map((item) => item.id));
  if (
    game.solution.evidenceLinks.filter((link) =>
      supportedIds.has(link.evidenceId),
    ).length < 3
  )
    throw new Error(
      "Solution links must point to material supporting evidence",
    );
  const culprit = game.suspects.find(
    (s) => s.id === game.solution.culpritSuspectId,
  )!;
  const escapedName = culprit.displayName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const accusationTerms =
    "culprit|thief|responsible|stole|stolen|took|removed|hid|hidden|swiped";
  const publicNarrative = [
    game.title,
    game.briefing,
    game.eventSummary,
    ...game.timeline.map((event) => event.event),
    ...game.evidence.flatMap((item) => [
      item.title,
      item.summary,
      item.content,
    ]),
  ].join(" ");
  const spoilerPatterns = [
    new RegExp(
      `\\b${escapedName}\\b[^.!?]{0,80}\\b(?:${accusationTerms})\\b`,
      "i",
    ),
    new RegExp(
      `\\b(?:${accusationTerms})\\b[^.!?]{0,80}\\b${escapedName}\\b`,
      "i",
    ),
  ];
  if (spoilerPatterns.some((pattern) => pattern.test(publicNarrative)))
    throw new Error("Public evidence directly identifies the culprit");
  for (const hint of game.hints)
    if (
      hint.toLocaleLowerCase().includes(culprit.displayName.toLocaleLowerCase())
    )
      throw new Error("Hint reveals culprit");
}

export function publicEvidence(e: Evidence) {
  const {
    privateClueSignificance: _significance,
    privateSupportsSuspectIds: _supports,
    privateContradictsSuspectIds: _contradicts,
    ...safe
  } = e;
  return safe;
}
