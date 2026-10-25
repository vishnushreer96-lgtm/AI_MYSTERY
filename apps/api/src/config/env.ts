import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/ai_mystery_room"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(2),
  CASE_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success)
  throw new Error(
    "Invalid server configuration. Review the required environment variables.",
  );
if (
  parsed.data.NODE_ENV === "production" &&
  (!parsed.data.GEMINI_API_KEY ||
    !parsed.data.GEMINI_MODEL ||
    !process.env.MONGODB_URI)
)
  throw new Error(
    "Production configuration is incomplete. Set Gemini credentials, model, and MongoDB URI.",
  );
export const env = parsed.data;
