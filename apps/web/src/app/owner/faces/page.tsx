import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  FACE_POINTS_COLUMNS,
  type FacePointsRow,
  savedByKey,
} from "../../../lib/faces/face-points.ts";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import { FacePicker } from "./FacePicker.tsx";

export const metadata: Metadata = { title: "Face picker · BFR", robots: { index: false } };

function Refused({ text }: { text: string }): ReactNode {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <h1 className="text-2xl font-black tracking-[0.18em] text-amber-100">Face picker</h1>
      <p className="mt-6 text-sm text-stone-300">{text}</p>
    </main>
  );
}

/**
 * Owner face picker (M2-06C): mark the left eye, right eye, and chin on every locked splash.
 * Signed-in users not on the `art_owners` allow-list are refused here and by RLS. Protected by
 * `src/proxy.ts` (`/owner`).
 */
export default async function FacePickerPage(): Promise<ReactNode> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=/owner/faces`);

  const { data: owner, error: ownerError } = await supabase
    .from("art_owners")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (ownerError) return <Refused text="The owner list could not be read. Try again shortly." />;
  if (!owner) return <Refused text="This page is only for the site owner." />;

  const { data: rows, error } = await supabase
    .from("face_points")
    .select(FACE_POINTS_COLUMNS)
    .overrideTypes<FacePointsRow[], { merge: false }>();
  if (error) return <Refused text="Saved face points could not be loaded. Try again shortly." />;

  return <FacePicker initialSaved={savedByKey(rows ?? [])} />;
}
