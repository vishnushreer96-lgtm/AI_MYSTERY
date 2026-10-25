import { publicEvidence, type GeneratedCase } from "@mystery/shared";
export function caseDto(
  game: GeneratedCase & { tone: string; difficulty: string; length: string },
) {
  return {
    title: game.title,
    tone: game.tone,
    difficulty: game.difficulty,
    length: game.length,
    setting: game.setting,
    briefing: game.briefing,
    eventSummary: game.eventSummary,
    suspects: game.suspects,
    timeline: game.timeline,
    evidence: game.evidence.map(publicEvidence),
    evidenceCount: game.evidence.length,
  };
}
export function evidenceDto(game: GeneratedCase, evidenceId: string) {
  const item = game.evidence.find((e) => e.id === evidenceId);
  return item ? publicEvidence(item) : null;
}
export function revealDto(game: GeneratedCase, suspectId: string) {
  const culprit = game.suspects.find(
    (s) => s.id === game.solution.culpritSuspectId,
  )!;
  const accused = game.suspects.find((s) => s.id === suspectId)!;
  return {
    correct: suspectId === culprit.id,
    accusedSuspect: { id: accused.id, displayName: accused.displayName },
    culprit: { id: culprit.id, displayName: culprit.displayName },
    solution: game.solution,
  };
}
