import mongoose, { Schema } from "mongoose";
import { env } from "../config/env.js";

const CaseSchema = new Schema(
  {
    schemaVersion: { type: Number, required: true, default: 1 },
    title: { type: String, required: true },
    scenarioSeed: { type: String, required: true },
    tone: { type: String, required: true },
    difficulty: { type: String, required: true },
    length: { type: String, required: true },
    status: {
      type: String,
      enum: ["ready", "completed"],
      default: "ready",
      required: true,
    },
    setting: { type: Schema.Types.Mixed, required: true },
    briefing: { type: String, required: true },
    eventSummary: { type: String, required: true },
    suspects: { type: [Schema.Types.Mixed], required: true },
    timeline: { type: [Schema.Types.Mixed], required: true },
    evidence: { type: [Schema.Types.Mixed], required: true },
    hints: { type: [String], required: true },
    solution: { type: Schema.Types.Mixed, required: true },
    generation: { type: Schema.Types.Mixed, required: true },
    completedAt: Date,
    accusation: { type: Schema.Types.Mixed },
  },
  { timestamps: true, minimize: false },
);
CaseSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: env.CASE_RETENTION_DAYS * 86400 },
);
export const MysteryCaseModel: mongoose.Model<any> =
  mongoose.models.MysteryCase ?? mongoose.model("MysteryCase", CaseSchema);
