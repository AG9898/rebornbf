import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SIGN_IN_PATH } from "../../../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server.ts";
import { isOwnedUnitId, toUnitDetailView } from "../../../../../lib/units/owned-units.ts";
import {
  stackCopyRow,
  UNIT_STACK_COLUMNS,
  type UnitStackRow,
} from "../../../../../lib/units/unit-stacks.ts";
import { UnitDetail } from "../../[id]/UnitDetail.tsx";

export const metadata: Metadata = { title: "Unit · BFR" };

/**
 * A stack of untouched copies (M4-05C, RESOLVED-75): the unit's detail as one level-1 copy, its
 * count, and Split, which moves one copy into an ordinary unit. Read under RLS, so a foreign,
 * unknown, or spent stack 404s.
 */
export default async function UnitStackPage({
  params,
}: {
  params: Promise<{ stackId: string }>;
}): Promise<ReactNode> {
  const { stackId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=/units/list`);
  if (!isOwnedUnitId(stackId)) notFound();

  const { data: stack } = await supabase
    .from("owned_unit_stacks")
    .select(UNIT_STACK_COLUMNS)
    .eq("id", stackId)
    .eq("user_id", userId)
    .gt("count", 0)
    .maybeSingle<UnitStackRow>();
  if (!stack) notFound();

  return (
    <UnitDetail
      unit={toUnitDetailView(stackCopyRow(stack))}
      evolveLabel={null}
      stack={{ id: stack.id, count: Number(stack.count) }}
    />
  );
}
