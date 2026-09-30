import { finishBattle } from "../../../../server/finish-battle.ts";

/** Proves the party wipe by replay before charging the one session continue. */
export async function POST(request: Request): Promise<Response> {
  return finishBattle(request, true);
}
