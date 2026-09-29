"use server";

import { parseSave, rowFromPoints } from "../../../lib/faces/face-points.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

export type SaveFaceResult = { ok: true } | { ok: false; message: string };

/**
 * Saves one unit form's eye and chin points (M2-06C) as the signed-in user. RLS on `face_points`
 * admits only accounts on the `art_owners` allow-list, so a non-owner's save fails there.
 */
export async function saveFacePoints(
  unit: string,
  form: string,
  points: unknown,
): Promise<SaveFaceResult> {
  const parsed = parseSave(unit, form, points);
  if (!parsed) return { ok: false, message: "Those points are not valid for a known unit form." };

  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) return { ok: false, message: "Sign in to save." };

  const { error } = await supabase.from("face_points").upsert(
    {
      ...rowFromPoints(parsed.unit, parsed.form, parsed.points),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "unit_id,form" },
  );
  if (error) {
    return {
      ok: false,
      message:
        error.code === "42501" ? "Only the site owner can save face points." : "Saving failed.",
    };
  }
  return { ok: true };
}
