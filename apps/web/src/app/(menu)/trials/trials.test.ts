import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORY_STAGES } from "../../../lib/quests/quest-map.ts";
import TrialsPage from "./page.tsx";

const { client, claims, progress } = vi.hoisted(() => ({
  client: vi.fn(),
  claims: vi.fn(),
  progress: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/supabase/server.ts", () => ({ createSupabaseServerClient: client }));

beforeEach(() => {
  vi.clearAllMocks();
  claims.mockResolvedValue({ data: { claims: { sub: "player-one" } } });
  progress.mockResolvedValue({ data: [], error: null });
  const query = { select: () => query, eq: () => query, overrideTypes: progress };
  client.mockResolvedValue({ auth: { getClaims: claims }, from: () => query });
});

async function render(): Promise<string> {
  return renderToStaticMarkup(await TrialsPage({ searchParams: Promise.resolve({}) }));
}

function clears(count: number): { stage_id: string; clear_count: number }[] {
  return STORY_STAGES.slice(0, count).map((stage) => ({ stage_id: stage.id, clear_count: 1 }));
}

describe("Trials entry flow", () => {
  it("uses the shared quest panels, title plate and Back/Home navigation on the vortex", async () => {
    const html = await render();
    expect(html).toContain('data-backdrop="vortex"');
    expect(html).toContain("assets/ui/title-plate.webp");
    expect(html.match(/assets\/ui\/stage-panel.webp/g)).toHaveLength(2);
    expect(html).toMatch(/<a[^>]* href="\/home"[^>]*>Back<\/a>/);
    expect(html).toMatch(/<a[^>]* href="\/home"[^>]*>Home<\/a>/);
    expect(html).toContain("Trial 1: Captain Locke");
    expect(html).toContain("Trial 2: Master Ozric");
    expect(html).toContain("2 waves");
    expect(html).toContain("Clear story stage 8");
    expect(html).toContain("Clear story stage 16");
    expect(html).not.toContain('href="/start/');
    expect(html).not.toContain("<form");
  });

  it("opens Trial 1's Reinforcement once chapter 1 is cleared, leaving Trial 2 locked", async () => {
    progress.mockResolvedValue({ data: clears(8), error: null });
    const html = await render();
    expect(html).toContain('href="/start/trial-01-captain-locke"');
    expect(html).not.toContain('href="/start/trial-02-master-ozric"');
    expect(html).toContain("assets/ui/ribbon-new.webp");
    expect(html).toContain("No continues");
  });

  it("keeps cleared trials replayable and opens Trial 2 after chapter 2", async () => {
    progress.mockResolvedValue({
      data: [...clears(16), { stage_id: "trial-01-captain-locke", clear_count: 1 }],
      error: null,
    });
    const html = await render();
    expect(html).toContain('href="/start/trial-01-captain-locke"');
    expect(html).toContain('href="/start/trial-02-master-ozric"');
    expect(html).toContain("assets/ui/ribbon-clear.webp");
    expect(html).toContain("assets/ui/ribbon-new.webp");
  });

  it("offers sign-in without playable trials when signed out", async () => {
    client.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain('href="/sign-in?next=/trials"');
    expect(html).not.toContain('href="/start/');
  });

  it("suppresses playable links when the progress read fails, even with returned rows", async () => {
    progress.mockResolvedValue({ data: clears(16), error: { message: "Unavailable" } });
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Your progress could not be loaded");
    expect(html).not.toContain('href="/start/');
  });
});
