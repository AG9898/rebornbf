import { finishBattle } from "../../../../server/finish-battle.ts";

/**
 * Verifies a finished story battle by replaying its input log on the server (M3-04C,
 * RESOLVED-08); see `src/server/finish-battle.ts`. Refunds unused items on a verified win or
 * loss; grants rewards only on a win.
 */
export async function POST(request: Request): Promise<Response> {
  return finishBattle(request);
}
