import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import {
  createCaseSchema,
  hintSchema,
  accusationSchema,
  evidenceMinimum,
} from "@mystery/shared";
import { env } from "./config/env.js";
import { MysteryCaseModel } from "./models/MysteryCase.js";
import { generateValidated, generator } from "./services/generation.js";
import { caseDto, evidenceDto, revealDto } from "./utils/dto.js";

export const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
});
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json({ limit: "16kb", strict: true }));
app.use(
  "/api/v1",
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      fail(
        res,
        429,
        "RATE_LIMITED",
        "Too many requests. Please try again later.",
      ),
  }),
);
app.use((req, res, next) => {
  res.locals.startedAt = Date.now();
  console.info(
    JSON.stringify({
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
    }),
  );
  next();
});

function ok(res: express.Response, data: unknown, status = 200) {
  return res
    .status(status)
    .json({ success: true, data, requestId: res.locals.requestId });
}
function fail(
  res: express.Response,
  status: number,
  code: string,
  message: string,
  details: unknown[] = [],
) {
  return res.status(status).json({
    success: false,
    error: { code, message, details },
    requestId: res.locals.requestId,
  });
}
function validId(id: string) {
  return /^[a-f\d]{24}$/i.test(id);
}
function asyncRoute(fn: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
function containsPersonalData(text: string) {
  return (
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(text) ||
    /\b(?:\+?\d[\d\s().-]{7,}\d)\b/.test(text) ||
    /(?:^|\s)@[A-Za-z0-9_.]{3,}/.test(text)
  );
}
function containsDisallowedContent(text: string) {
  return /\b(?:graphic gore|explicit sexual|sexual assault|torture instructions|how to build a bomb)\b/i.test(
    text,
  );
}

app.get("/api/v1/health", (_req, res) => ok(res, { status: "ok" }));
app.post(
  "/api/v1/cases",
  asyncRoute(async (req, res) => {
    const parsed = createCaseSchema.safeParse(req.body);
    if (!parsed.success)
      return fail(
        res,
        400,
        "VALIDATION_ERROR",
        "Please enter a scenario between 30 and 1500 characters and choose valid case options.",
        parsed.error.issues,
      );
    if (containsPersonalData(parsed.data.scenario))
      return fail(
        res,
        400,
        "VALIDATION_ERROR",
        "Please remove real contact details and fictionalize the scenario before creating a case.",
      );
    if (containsDisallowedContent(parsed.data.scenario))
      return fail(
        res,
        400,
        "VALIDATION_ERROR",
        "Please use a non-graphic fictional premise suitable for a general audience.",
      );
    let generated: Awaited<ReturnType<typeof generateValidated>>;
    try {
      generated = await generateValidated(parsed.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "AI_UNAVAILABLE")
        return fail(
          res,
          503,
          "AI_PROVIDER_UNAVAILABLE",
          "Mystery generation is not configured. Please try again later.",
        );
      if (message === "AI_TIMEOUT")
        return fail(
          res,
          504,
          "AI_GENERATION_TIMEOUT",
          "Mystery generation took too long. Please retry.",
        );
      return fail(
        res,
        502,
        "AI_PROVIDER_ERROR",
        "The mystery could not be generated and validated. Please retry.",
      );
    }
    if (
      containsPersonalData(JSON.stringify(generated.game)) ||
      containsDisallowedContent(JSON.stringify(generated.game))
    )
      return fail(
        res,
        502,
        "AI_PROVIDER_ERROR",
        "Generated content did not pass safety checks. Please retry.",
      );
    const required = evidenceMinimum[parsed.data.length];
    if (generated.game.evidence.length < required)
      return fail(
        res,
        502,
        "AI_PROVIDER_ERROR",
        "The mystery could not be validated. Please try again.",
      );
    const doc = await MysteryCaseModel.create({
      ...generated.game,
      scenarioSeed: parsed.data.scenario,
      ...parsed.data,
      generation: {
        provider: generator.provider,
        model:
          generator.provider === "mock"
            ? "deterministic-mock"
            : env.GEMINI_MODEL!,
        promptVersion: "1",
        generatedAt: new Date(),
        validationAttempts: generated.attempts,
      },
    });
    return ok(
      res,
      {
        caseId: String(doc._id),
        case: caseDto({ ...generated.game, ...parsed.data }),
      },
      201,
    );
  }),
);
app.get(
  "/api/v1/cases/:caseId",
  asyncRoute(async (req, res) => {
    if (!validId(req.params.caseId!))
      return fail(res, 404, "NOT_FOUND", "Case not found.");
    const doc = await MysteryCaseModel.findById(req.params.caseId).lean<any>();
    if (!doc) return fail(res, 404, "NOT_FOUND", "Case not found.");
    return ok(res, { caseId: String(doc._id), case: caseDto(doc as never) });
  }),
);
app.get(
  "/api/v1/cases/:caseId/evidence/:evidenceId",
  asyncRoute(async (req, res) => {
    if (!validId(req.params.caseId!))
      return fail(res, 404, "NOT_FOUND", "Evidence not found.");
    const doc = await MysteryCaseModel.findById(req.params.caseId).lean<any>();
    const evidence = doc
      ? evidenceDto(doc as never, req.params.evidenceId!)
      : null;
    return evidence
      ? ok(res, evidence)
      : fail(res, 404, "NOT_FOUND", "Evidence not found.");
  }),
);
app.post(
  "/api/v1/cases/:caseId/hints",
  asyncRoute(async (req, res) => {
    const body = hintSchema.safeParse(req.body);
    if (!body.success)
      return fail(res, 400, "VALIDATION_ERROR", "Choose a hint from 1 to 3.");
    if (!validId(req.params.caseId!))
      return fail(res, 404, "NOT_FOUND", "Case not found.");
    const doc = await MysteryCaseModel.findById(req.params.caseId).lean<any>();
    if (!doc) return fail(res, 404, "NOT_FOUND", "Case not found.");
    return ok(res, {
      level: body.data.level,
      hint: doc.hints[body.data.level - 1],
    });
  }),
);
app.post(
  "/api/v1/cases/:caseId/accusation",
  asyncRoute(async (req, res) => {
    const body = accusationSchema.safeParse(req.body);
    if (!body.success)
      return fail(
        res,
        400,
        "VALIDATION_ERROR",
        "Choose a suspect from this case.",
      );
    if (!validId(req.params.caseId!))
      return fail(res, 404, "NOT_FOUND", "Case not found.");
    const doc = await MysteryCaseModel.findOneAndUpdate(
      {
        _id: req.params.caseId,
        status: "ready",
        "suspects.id": body.data.suspectId,
      },
      [
        {
          $set: {
            status: "completed",
            completedAt: "$$NOW",
            accusation: {
              suspectId: body.data.suspectId,
              submittedAt: "$$NOW",
              correct: {
                $eq: [body.data.suspectId, "$solution.culpritSuspectId"],
              },
            },
          },
        },
      ],
      { new: true },
    ).lean<any>();
    if (!doc) {
      const existing = await MysteryCaseModel.findById(
        req.params.caseId,
      ).lean<any>();
      if (!existing) return fail(res, 404, "NOT_FOUND", "Case not found.");
      if (existing.status === "completed")
        return fail(
          res,
          409,
          "CASE_ALREADY_COMPLETED",
          "This case already has a final accusation. Open its reveal.",
        );
      return fail(
        res,
        400,
        "VALIDATION_ERROR",
        "Choose a suspect from this case.",
      );
    }
    return ok(res, revealDto(doc as never, body.data.suspectId));
  }),
);
app.get(
  "/api/v1/cases/:caseId/reveal",
  asyncRoute(async (req, res) => {
    if (!validId(req.params.caseId!))
      return fail(res, 404, "NOT_FOUND", "Case not found.");
    const doc = await MysteryCaseModel.findById(req.params.caseId).lean<any>();
    if (!doc) return fail(res, 404, "NOT_FOUND", "Case not found.");
    if (doc.status !== "completed" || !doc.accusation?.suspectId)
      return fail(
        res,
        403,
        "CASE_NOT_COMPLETED",
        "Submit a final accusation to see the solution.",
      );
    return ok(res, revealDto(doc as never, doc.accusation.suspectId));
  }),
);

app.use((_req, res) =>
  fail(res, 404, "NOT_FOUND", "The requested resource was not found."),
);
const errors: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.type === "entity.too.large")
    return fail(res, 413, "REQUEST_TOO_LARGE", "Request is too large.");
  if (err?.type === "entity.parse.failed")
    return fail(
      res,
      400,
      "VALIDATION_ERROR",
      "Request body must contain valid JSON.",
    );
  console.error(
    JSON.stringify({
      requestId: res.locals.requestId,
      error: err?.name ?? "Error",
    }),
  );
  return fail(
    res,
    500,
    "INTERNAL_SERVER_ERROR",
    "Something went wrong. Please try again.",
  );
};
app.use(errors);
