import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORY_STAGES } from "../../../lib/quests/quest-map.ts";
import { PELL_LINES } from "../../../lib/quests/trials.ts";
import TrialsPage from "../trials/page.tsx";
import ProvingLabPage from "./lab/page.tsx";
import ConclavePage from "./page.tsx";

const { client, claims, progress, redirect } = vi.hoisted(() => ({
  client: vi.fn(),
  claims: vi.fn(),
  progress: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../../../lib/supabase/server.ts", () => ({ createSupabaseServerClient: client }));

beforeEach(() => {
  vi.clearAllMocks();
  claims.mockResolvedValue({ data: { claims: { sub: "player-one" } } });
  progress.mockResolvedValue({ data: [], error: null });
  const query = { select: () => query, eq: () => query, overrideTypes: progress };
  client.mockResolvedValue({ auth: { getClaims: claims }, from: () => query });
});

async function lab(error?: string): Promise<string> {
  return renderToStaticMarkup(
    await ProvingLabPage({ searchParams: Promise.resolve(error ? { error } : {}) }),
  );
}

async function conclave(): Promise<string> {
  return renderToStaticMarkup(await ConclavePage());
}

function clears(count: number): { stage_id: string; clear_count: number }[] {
  return STORY_STAGES.slice(0, count).map((stage) => ({ stage_id: stage.id, clear_count: 1 }));
}

const TRIAL_1 = { stage_id: "trial-01-captain-locke", clear_count: 1 };

/** Escaped as React renders text, so lines with apostrophes match the markup. */
function escaped(text: string): string {
  return text.replaceAll("'", "&#x27;");
}

describe("Conclave map (M6-01G)", () => {
  it("draws the Conclave with Back to Home and one Proving Lab plate marked NEW AREA", async () => {
    const html = await conclave();
    expect(html).toContain('data-backdrop="conclave"');
    expect(html).toContain("assets/ui/bg-conclave.webp");
    expect(html).toMatch(/<a[^>]* href="\/home"[^>]*>Back<\/a>/);
    expect(html.match(/assets\/ui\/area-plate\.webp/g)).toHaveLength(1);
    expect(html).toContain('href="/conclave/lab"');
    expect(html).toContain("Proving Lab");
    expect(html).toContain("NEW AREA");
    expect(html).toContain("0/2");
  });

  it("drops NEW AREA once Trial 1 is first cleared", async () => {
    progress.mockResolvedValue({ data: [...clears(8), TRIAL_1], error: null });
    const html = await conclave();
    expect(html).not.toContain("NEW AREA");
    expect(html).toContain("1/2");
  });

  it("offers sign-in when signed out", async () => {
    client.mockResolvedValue(null);
    expect(await conclave()).toContain('href="/sign-in?next=/conclave"');
  });
});

describe("Proving Lab (M6-01G)", () => {
  it("draws Pell, both trials on locked plates, Back to the Conclave, and the nothing-open line", async () => {
    const html = await lab();
    expect(html).toContain('data-backdrop="proving-lab"');
    expect(html).toContain("assets/ui/host-pell.webp");
    expect(html).toContain("assets/ui/dialogue-panel.webp");
    expect(html.match(/assets\/ui\/trial-plate\.webp/g)).toHaveLength(2);
    expect(html).toMatch(/<a[^>]* href="\/conclave"[^>]*>Back<\/a>/);
    expect(html).toContain("Trial 1: Captain Locke");
    expect(html).toContain("Trial 2: Master Ozric");
    expect(html).toContain("Clear story stage 8");
    expect(html).toContain("Clear story stage 16");
    expect(html.match(/data-state="locked"/g)).toHaveLength(2);
    expect(html).not.toContain('href="/start/');
    expect(html).toContain(escaped(PELL_LINES.nothingOpen));
  });

  it("opens Trial 1 with a NEW ribbon and Pell's new-trial line after chapter 1", async () => {
    progress.mockResolvedValue({ data: clears(8), error: null });
    const html = await lab();
    expect(html).toContain('href="/start/trial-01-captain-locke"');
    expect(html).not.toContain('href="/start/trial-02-master-ozric"');
    expect(html).toContain("assets/ui/ribbon-new.webp");
    expect(html).toContain("No continues");
    expect(html).toContain(escaped(PELL_LINES.newTrial));
  });

  it("keeps a cleared trial replayable with a CLEAR ribbon and the first-clear line", async () => {
    progress.mockResolvedValue({ data: [...clears(8), TRIAL_1], error: null });
    const html = await lab();
    expect(html).toContain('href="/start/trial-01-captain-locke"');
    expect(html).toContain("assets/ui/ribbon-clear.webp");
    expect(html).toContain("You beat my replica?!");
  });

  it("uses the all-cleared line once both trials are cleared", async () => {
    progress.mockResolvedValue({
      data: [...clears(16), TRIAL_1, { stage_id: "trial-02-master-ozric", clear_count: 1 }],
      error: null,
    });
    const html = await lab();
    expect(html).toContain('href="/start/trial-02-master-ozric"');
    expect(html).toContain(escaped(PELL_LINES.allCleared));
  });

  it("offers sign-in with no playable trials and the default line when signed out", async () => {
    client.mockResolvedValue(null);
    const html = await lab();
    expect(html).toContain('href="/sign-in?next=/conclave/lab"');
    expect(html).not.toContain('href="/start/');
    expect(html).toContain(escaped(PELL_LINES.default));
  });

  it("suppresses playable links when the progress read fails, even with returned rows", async () => {
    progress.mockResolvedValue({ data: clears(16), error: { message: "Unavailable" } });
    const html = await lab();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Your progress could not be loaded");
    expect(html).not.toContain('href="/start/');
  });

  it("shows a start error passed back to the lab", async () => {
    expect(await lab("Trial is locked")).toContain("Trial is locked");
  });
});

describe("/trials (M6-01G)", () => {
  it("redirects to the Proving Lab, keeping a start error", async () => {
    await expect(TrialsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "redirect:/conclave/lab",
    );
    await expect(TrialsPage({ searchParams: Promise.resolve({ error: "Nope" }) })).rejects.toThrow(
      "redirect:/conclave/lab?error=Nope",
    );
  });
});
