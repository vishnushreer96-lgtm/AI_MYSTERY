import { useEffect, useState } from "react";
import type { CaseLength, CaseTone, Difficulty } from "@mystery/shared";

type Data<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
type CaseData = {
  caseId: string;
  case: {
    title: string;
    tone: CaseTone;
    difficulty: Difficulty;
    length: CaseLength;
    setting: { location: string; dateLabel: string };
    briefing: string;
    eventSummary: string;
    suspects: {
      id: string;
      displayName: string;
      role: string;
      profile: string;
      publicMotive: string;
      publicOpportunity: string;
      alibi: string;
      publicDescription: string;
    }[];
    timeline: {
      id: string;
      time: string;
      event: string;
      relatedEvidenceIds: string[];
    }[];
    evidence: Evidence[];
    evidenceCount: number;
  };
};
type Evidence = {
  id: string;
  type: string;
  title: string;
  summary: string;
  content: string;
  sourceLabel: string;
  occurredAt?: string;
  visual?: { simulated?: boolean; altText?: string };
};
type Reveal = {
  correct: boolean;
  accusedSuspect: { id: string; displayName: string };
  culprit: { id: string; displayName: string };
  solution: {
    motive: string;
    methodSummary: string;
    explanation: string;
    chronologicalReconstruction: string[];
    evidenceLinks: { evidenceId: string; explanation: string }[];
    redHerrings: { evidenceId: string; explanation: string }[];
  };
};
const samples = [
  "A rare clockwork star map vanishes from a small observatory on the night of its public unveiling.",
  "The final recipe card disappears from a family bakery shortly before a friendly neighborhood contest.",
  "A hand-painted mural sketch goes missing from a community art studio before its opening exhibition.",
];
const api = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const json = (await response.json()) as Data<T>;
  if (!response.ok || !json.success)
    throw new Error(json.success ? "Request failed" : json.error.message);
  return json.data;
}

export function App() {
  const [caseId, setCaseId] = useState(() =>
    location.pathname.startsWith("/case/")
      ? (location.pathname.split("/")[2] ?? "")
      : "",
  );
  const [game, setGame] = useState<CaseData["case"] | null>(null);
  const [scenario, setScenario] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [tone, setTone] = useState<CaseTone>("classic_detective");
  const [length, setLength] = useState<CaseLength>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Evidence | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [hint, setHint] = useState(0);
  const [hintText, setHintText] = useState("");
  const [accuse, setAccuse] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [accusing, setAccusing] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [activeTab, setActiveTab] = useState<
    "briefing" | "suspects" | "evidence" | "timeline"
  >("evidence");

  useEffect(() => {
    if (!caseId) return;
    setBusy(true);
    setError("");
    request<CaseData>(`/cases/${caseId}`)
      .then((data) => {
        setGame(data.case);
        history.replaceState(null, "", `/case/${caseId}`);
      })
      .then(() =>
        request<Reveal>(`/cases/${caseId}/reveal`)
          .then(setReveal)
          .catch(() => undefined),
      )
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load this case."),
      )
      .finally(() => setBusy(false));
  }, [caseId]);

  useEffect(() => {
    if (!selected && !confirm) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setConfirm(false);
      } else if (event.key === "Tab" && dialog) {
        const controls = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "button:not([disabled]), a[href], select:not([disabled]), textarea:not([disabled]), input:not([disabled])",
          ),
        );
        if (!controls.length) return;
        const first = controls[0]!;
        const last = controls[controls.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [selected, confirm]);

  async function createCase(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (scenario.trim().length < 30 || scenario.trim().length > 1500) {
      setError("Enter a fictional scenario between 30 and 1,500 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await request<CaseData>("/cases", {
        method: "POST",
        body: JSON.stringify({ scenario, difficulty, tone, length }),
      });
      setGame(result.case);
      setCaseId(result.caseId);
      setReveal(null);
      history.pushState(null, "", `/case/${result.caseId}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Mystery generation failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function getHint() {
    const next = Math.min(hint + 1, 3);
    if (next === hint) return;
    try {
      const result = await request<{ level: number; hint: string }>(
        `/cases/${caseId}/hints`,
        { method: "POST", body: JSON.stringify({ level: next }) },
      );
      setHint(next);
      setHintText(result.hint);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load hint.");
    }
  }
  async function submitAccusation() {
    if (accusing) return;
    setAccusing(true);
    try {
      setReveal(
        await request<Reveal>(`/cases/${caseId}/accusation`, {
          method: "POST",
          body: JSON.stringify({ suspectId: accuse }),
        }),
      );
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit accusation.");
    } finally {
      setAccusing(false);
    }
  }

  if (busy && !game)
    return (
      <main className="loading" aria-live="polite">
        <div className="seal">✦</div>
        <p>Preparing your mystery…</p>
        <span>Generating and checking the fictional case</span>
      </main>
    );
  if (!game)
    return (
      <main className="landing">
        <nav className="topbar">
          <a className="brand" href="/">
            <span className="brand-mark">M</span>
            <span>
              THE MYSTERY ROOM<small>FICTIONAL CASE FILES</small>
            </span>
          </a>
          <span className="status">
            <i /> CASE DESK OPEN
          </span>
        </nav>
        <section className="hero">
          <div className="eyebrow">
            <span>NO. 001</span>
            <span className="line" />
            <span>YOUR INVESTIGATION BEGINS</span>
          </div>
          <h1>
            Every detail
            <br />
            leaves a <em>trace.</em>
          </h1>
          <p className="intro">
            Build a fictional case. Examine the evidence. Find the one detail
            that changes everything.
          </p>
          <div className="workbench">
            <div className="workbench-title">
              <span>
                <b>01</b> NEW CASE FILE
              </span>
              <span className="tag">PRIVATE INVESTIGATION</span>
            </div>
            <form onSubmit={createCase}>
              <label htmlFor="scenario">THE SCENARIO</label>
              <textarea
                id="scenario"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                maxLength={1500}
                placeholder="A rare prototype disappears from a locked university lab before a demo…"
                aria-describedby="scenario-note scenario-count"
              />
              <div className="field-meta">
                <span id="scenario-note">
                  Use a fictional premise. Don’t include real personal or
                  confidential information.
                </span>
                <span id="scenario-count">
                  {scenario.trim().length} / 1,500
                </span>
              </div>
              <div className="samples">
                <span>TRY A CASE SEED</span>
                {samples.map((s, i) => (
                  <button type="button" key={s} onClick={() => setScenario(s)}>
                    0{i + 1}{" "}
                    {["The observatory", "The bakery", "The art studio"][i]} ↗
                  </button>
                ))}
              </div>
              <div className="options">
                <label>
                  DIFFICULTY
                  <select
                    value={difficulty}
                    onChange={(e) =>
                      setDifficulty(e.target.value as Difficulty)
                    }
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
                <label>
                  CASE TONE
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as CaseTone)}
                  >
                    <option value="classic_detective">Classic Detective</option>
                    <option value="suspense">Suspense</option>
                    <option value="lighthearted">Lighthearted</option>
                    <option value="sci_fi">Sci-Fi</option>
                  </select>
                </label>
                <label>
                  CASE LENGTH
                  <select
                    value={length}
                    onChange={(e) => setLength(e.target.value as CaseLength)}
                  >
                    <option value="short">Short</option>
                    <option value="standard">Standard</option>
                    <option value="extended">Extended</option>
                  </select>
                </label>
              </div>
              {error && (
                <p role="alert" className="error">
                  {error}{" "}
                  <button type="button" onClick={createCase}>
                    Retry ↗
                  </button>
                </p>
              )}
              <button className="primary" disabled={busy} type="submit">
                {busy ? "PREPARING CASE…" : "CREATE MYSTERY"}
                <span>↗</span>
              </button>
            </form>
          </div>
          <div className="hero-foot">
            <span>✳ DESIGNED FOR CURIOSITY</span>
            <span>FICTIONAL ENTERTAINMENT · NOT REAL EVIDENCE</span>
          </div>
        </section>
      </main>
    );

  const evidenceById = new Map(game.evidence.map((item) => [item.id, item]));
  return (
    <main className="room">
      <header className="room-header">
        <a className="brand" href="/">
          <span className="brand-mark">M</span>
          <span>
            MYSTERY ROOM<small>ACTIVE INVESTIGATION</small>
          </span>
        </a>
        <span className="case-no">CASE {caseId.slice(-6).toUpperCase()}</span>
        <button
          className="new-case"
          onClick={() => {
            history.pushState(null, "", "/");
            setCaseId("");
            setGame(null);
            setReveal(null);
          }}
        >
          ＋ NEW CASE
        </button>
      </header>
      <div className="fiction-banner">
        ✳ &nbsp;FICTIONAL CASE FILE &nbsp;·&nbsp; All people, events, and
        evidence in this investigation are invented.
      </div>
      {error && (
        <p role="alert" className="error room-error">
          {error}
        </p>
      )}
      {reveal ? (
        <section className="reveal">
          <div className="eyebrow">
            CASE CLOSED <span className="line" /> FINAL REPORT
          </div>
          <h1>
            {reveal.correct ? "A sharp eye." : "The details tell the story."}
          </h1>
          <p className="verdict">
            {reveal.correct ? "CORRECT ACCUSATION" : "INCORRECT ACCUSATION"} ·
            You accused {reveal.accusedSuspect.displayName}. The culprit was{" "}
            {reveal.culprit.displayName}.
          </p>
          <div className="reveal-grid">
            <article>
              <h2>What happened</h2>
              <p>{reveal.solution.explanation}</p>
              <h3>Motive & method</h3>
              <p>
                {reveal.solution.motive} {reveal.solution.methodSummary}
              </p>
            </article>
            <article>
              <h2>Evidence connections</h2>
              {reveal.solution.evidenceLinks.map((link) => (
                <p className="connection" key={link.evidenceId}>
                  <b>
                    {evidenceById.get(link.evidenceId)?.title ?? "Case record"}
                  </b>
                  <br />
                  {link.explanation}
                </p>
              ))}
              <h2>Red herring</h2>
              {reveal.solution.redHerrings.map((link) => (
                <p className="connection" key={link.evidenceId}>
                  <b>
                    {evidenceById.get(link.evidenceId)?.title ?? "Case record"}
                  </b>
                  <br />
                  {link.explanation}
                </p>
              ))}
            </article>
          </div>
          <h2>Chronological reconstruction</h2>
          <ol className="reconstruction">
            {reveal.solution.chronologicalReconstruction.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <button
            className="primary"
            onClick={() => {
              history.pushState(null, "", "/");
              setCaseId("");
              setGame(null);
              setReveal(null);
            }}
          >
            START A NEW CASE <span>↗</span>
          </button>
        </section>
      ) : (
        <>
          <div
            className="mobile-tabs"
            role="tablist"
            aria-label="Case sections"
          >
            {(["briefing", "suspects", "evidence", "timeline"] as const).map(
              (tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.toUpperCase()}
                </button>
              ),
            )}
          </div>
          <header className="case-title">
            <div>
              <div className="eyebrow">
                INVESTIGATION IN PROGRESS <span className="line" />{" "}
                {game.length.toUpperCase()} CASE
              </div>
              <h1>{game.title}</h1>
              <p>
                {game.setting.location} <span>·</span> {game.setting.dateLabel}
              </p>
            </div>
            <span className="case-index">
              FILE
              <br />
              <b>01 — {game.evidenceCount.toString().padStart(2, "0")}</b>
            </span>
          </header>
          <div className="dashboard">
            <aside className="sidebar">
              <section
                className={
                  activeTab === "briefing" ? "mobile-active" : "mobile-section"
                }
              >
                <div className="section-label">
                  THE BRIEFING <span>01</span>
                </div>
                <p>{game.briefing}</p>
                <p className="muted">{game.eventSummary}</p>
              </section>
              <section
                className={
                  activeTab === "suspects" ? "mobile-active" : "mobile-section"
                }
              >
                <div className="section-label">
                  PERSONS OF INTEREST{" "}
                  <span>
                    {game.suspects.length.toString().padStart(2, "0")}
                  </span>
                </div>
                <div className="suspects">
                  {game.suspects.map((s, i) => (
                    <article className="suspect suspect-detail" key={s.id}>
                      <div className="suspect-avatar">
                        {s.displayName
                          .split(" ")
                          .map((x) => x[0])
                          .join("")}
                      </div>
                      <div>
                        <b>{s.displayName}</b>
                        <small>
                          {s.role} · {String(i + 1).padStart(2, "0")}
                        </small>
                        <p>{s.publicDescription}</p>
                        <small>MOTIVE · {s.publicMotive}</small>
                        <small>OPPORTUNITY · {s.publicOpportunity}</small>
                        <small>ALIBI · {s.alibi}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <section
                className={
                  activeTab === "timeline" ? "mobile-active" : "mobile-section"
                }
              >
                <div className="section-label">
                  CASE TIMELINE{" "}
                  <span>
                    {game.timeline.length.toString().padStart(2, "0")}
                  </span>
                </div>
                <ol className="timeline">
                  {game.timeline.map((item) => (
                    <li key={item.id}>
                      <time>{item.time}</time>
                      <p>{item.event}</p>
                    </li>
                  ))}
                </ol>
              </section>
              <button
                className="hint-button"
                onClick={getHint}
                disabled={hint >= 3}
              >
                ⌁ &nbsp;REQUEST A HINT <span>{hint}/3</span>
              </button>
              {hintText && (
                <p className="hint-text" aria-live="polite">
                  {hintText}
                </p>
              )}
            </aside>
            <section
              className={`evidence-workspace ${activeTab === "evidence" ? "mobile-active" : "mobile-section"}`}
            >
              <div className="workspace-head">
                <div>
                  <div className="section-label">
                    EVIDENCE BOARD{" "}
                    <span>
                      {game.evidenceCount.toString().padStart(2, "0")} ITEMS
                    </span>
                  </div>
                  <p>Examine the record. Revisit what doesn’t add up.</p>
                </div>
                <span className="review-count">
                  {reviewed.length} / {game.evidenceCount} REVIEWED
                </span>
              </div>
              <div className="evidence-grid">
                {game.evidence.map((item, i) => (
                  <button
                    className={`evidence-card ${reviewed.includes(item.id) ? "reviewed" : ""}`}
                    key={item.id}
                    onClick={() => setSelected(item)}
                  >
                    <span className="card-top">
                      <span>
                        {item.type.replaceAll("_", " ").toUpperCase()}
                      </span>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                    </span>
                    <span className="artifact">
                      {item.type === "cctv" ? (
                        <>
                          <span>◉</span>
                          <small>CAMERA 04 · SIMULATED RECORDING</small>
                        </>
                      ) : item.type === "chat" ? (
                        <>
                          <span>▤</span>
                          <small>FICTIONAL CHAT RECORD</small>
                        </>
                      ) : item.type === "image" ? (
                        <>
                          <span>▧</span>
                          <small>SIMULATED IMAGE</small>
                        </>
                      ) : (
                        <>
                          <span>✳</span>
                          <small>CASE DOCUMENT</small>
                        </>
                      )}
                    </span>
                    <strong>{item.title}</strong>
                    <span className="preview">{item.summary}</span>
                    <span className="card-foot">
                      {item.sourceLabel}
                      <span>
                        {reviewed.includes(item.id)
                          ? "✓ REVIEWED"
                          : "OPEN FILE ↗"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <section className="accusation">
                <div>
                  <div className="section-label">
                    READY TO NAME YOUR SUSPECT?
                  </div>
                  <p>
                    Your accusation is final for this case. Review the evidence
                    before you decide.
                  </p>
                </div>
                <div className="accuse-controls">
                  <label htmlFor="suspect-select">ACCUSE</label>
                  <select
                    id="suspect-select"
                    value={accuse}
                    onChange={(e) => setAccuse(e.target.value)}
                  >
                    <option value="">Select a suspect…</option>
                    {game.suspects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                  <button
                    className="accuse-button"
                    disabled={!accuse}
                    onClick={() => setConfirm(true)}
                  >
                    MAKE ACCUSATION ↗
                  </button>
                </div>
              </section>
            </section>
          </div>
        </>
      )}
      {selected && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="evidence-title"
          >
            <button
              className="close"
              onClick={() => setSelected(null)}
              aria-label="Close evidence"
            >
              ×
            </button>
            <div className="eyebrow">
              FICTIONAL EVIDENCE <span className="line" />{" "}
              {selected.type.toUpperCase()}
            </div>
            <h2 id="evidence-title">{selected.title}</h2>
            <p className="source">
              {selected.sourceLabel}{" "}
              {selected.occurredAt && `· ${selected.occurredAt}`}
            </p>
            {selected.type === "cctv" && (
              <div className="artifact modal-artifact">
                ◉ &nbsp; CAMERA 04 · SIMULATED CCTV RECORDING
              </div>
            )}
            {selected.type === "image" && (
              <div className="artifact modal-artifact">
                ▧ &nbsp; SIMULATED IMAGE
              </div>
            )}
            {selected.type === "chat" && (
              <div className="artifact modal-artifact">
                ▤ &nbsp; FICTIONAL CHAT RECORD
              </div>
            )}
            <p className="evidence-content">{selected.content}</p>
            <p className="muted">{selected.summary}</p>
            <button
              className="primary"
              onClick={() => {
                if (!reviewed.includes(selected.id))
                  setReviewed([...reviewed, selected.id]);
                setSelected(null);
              }}
            >
              MARK AS REVIEWED <span>✓</span>
            </button>
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <button
              className="close"
              onClick={() => setConfirm(false)}
              aria-label="Close confirmation"
            >
              ×
            </button>
            <div className="eyebrow">FINAL DECISION</div>
            <h2 id="confirm-title">
              Accuse {game.suspects.find((s) => s.id === accuse)?.displayName}?
            </h2>
            <p>
              This accusation is final. Once submitted, the complete solution
              will be revealed.
            </p>
            <div className="confirm-actions">
              <button className="secondary" onClick={() => setConfirm(false)}>
                KEEP INVESTIGATING
              </button>
              <button
                className="accuse-button"
                onClick={submitAccusation}
                disabled={accusing}
              >
                {accusing ? "SUBMITTING…" : "CONFIRM ACCUSATION ↗"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
