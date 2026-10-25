# AI Mystery Room

AI Mystery Room creates fictional detective puzzles from short scenario seeds. Generated records are entertainment, not real evidence. Gemini credentials and canonical answers remain on the API server; accusation scoring is server-side.

## Requirements

- Node.js 22 LTS or newer and npm
- MongoDB local instance or Atlas connection string
- A Google AI Studio API key and a currently supported Gemini model for AI-generated cases

## Setup

1. Install dependencies from the repository root:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` at the repository root and configure `MONGODB_URI`, `GEMINI_API_KEY`, and `GEMINI_MODEL`. Keep this file private. The Gemini model is intentionally not guessed or hard-coded. In development without an API key, the deterministic mock generator is used.
3. Start MongoDB, then run:

   ```sh
   npm run dev
   ```

   The API listens on port 5000 and Vite on port 5173. The browser calls only the API; it never receives Gemini or image-provider secrets.

The image provider is a simulated placeholder fallback. The MVP does not create actual image or video files. CCTV cards are explicitly labeled simulated recordings.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run test:api` runs API tests. Tests use a deterministic generator and do not make paid Gemini calls.

## Troubleshooting

- **MongoDB unavailable:** check that MongoDB is running and that `MONGODB_URI` is valid. Startup reports a safe connection error without returning database details to the browser.
- **Gemini unavailable:** check the API server's `GEMINI_API_KEY` and `GEMINI_MODEL`. The browser cannot configure either value. Generation errors can be retried from the landing form.
- **CORS error:** set `CLIENT_ORIGIN` to the web origin (default `http://localhost:5173`).
- **Generation timeout or validation error:** retry with a shorter fictional seed. Invalid generated output is discarded rather than stored.

## Data and limitations

Cases are stored in MongoDB with a configurable TTL (`CASE_RETENTION_DAYS`, default 30). No authentication is required; case URLs use MongoDB ObjectIds. Scenario seeds should not contain real personal, confidential, or sensitive information. The API rejects common email and phone patterns in scenario input. This first MVP does not include authentication, asynchronous jobs, actual media generation, or server-persisted review progress.
