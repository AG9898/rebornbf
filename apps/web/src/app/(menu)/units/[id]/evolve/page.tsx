import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import menu from "../../../../../components/menu/menu.module.css";
import { textBoxStyle } from "../../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../../components/menu/UiImage.tsx";
import { THUMB_ART_SIZE } from "../../../../../components/menu/ui-assets.ts";
import { SIGN_IN_PATH } from "../../../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server.ts";
import {
  type EvolutionFormView,
  evolutionPlan,
  evolveBlockers,
  type MaterialItemNeed,
  type MaterialUnitNeed,
  type OwnedItemRow,
  type SquadUseRow,
} from "../../../../../lib/units/evolution.ts";
import {
  isOwnedUnitId,
  OWNED_UNIT_COLUMNS,
  type OwnedUnitRow,
  toOwnedUnitView,
  unitContent,
} from "../../../../../lib/units/owned-units.ts";
import { UNIT_STACK_COLUMNS, type UnitStackRow } from "../../../../../lib/units/unit-stacks.ts";
import units from "../../units.module.css";
import { EvolveButton } from "./EvolveButton.tsx";
import evolve from "./evolve.module.css";

export const metadata: Metadata = { title: "Evolve · BFR" };

type PlateRow = readonly [label: string, value: string];

function Plates({ rows, label }: { rows: readonly PlateRow[]; label: string }): ReactNode {
  return (
    <dl className={evolve.plates} aria-label={label}>
      {rows.map(([name, value]) => (
        <div key={name} className={evolve.plate}>
          <dt className={`${evolve.plateLabel} ${units.outline}`}>{name}</dt>
          <dd className={`${evolve.plateValue} ${units.outline}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A form's idle sprite (or a stand-in initial); `silhouette` draws it as solid white. */
function FormSprite({
  form,
  alt,
  silhouette,
}: {
  form: EvolutionFormView;
  alt: string;
  silhouette?: boolean;
}): ReactNode {
  return (
    <figure className={evolve.sprite} data-silhouette={silhouette || undefined}>
      {form.sprite ? (
        <Image src={form.sprite} alt={alt} width={256} height={256} unoptimized />
      ) : (
        <span className={evolve.spriteInitial} role="img" aria-label={alt}>
          {silhouette ? "?" : form.name.charAt(0)}
        </span>
      )}
      <figcaption className={`${evolve.spriteRarity} ${units.outline}`}>
        {form.rarityLabel}
      </figcaption>
    </figure>
  );
}

/** One material: the element-framed thumb (a gold CSS frame for items), ×N, and "Have N". */
function MaterialIcon({ need }: { need: MaterialUnitNeed | MaterialItemNeed }): ReactNode {
  const unit = "unitId" in need ? need : null;
  const short = need.owned < need.count;
  return (
    <li className={evolve.material} data-short={short || undefined}>
      <span
        className={`${units.icon} ${evolve.materialIcon}`}
        data-element={unit?.element ?? undefined}
        data-item={unit ? undefined : true}
        role="img"
        aria-label={`${need.name} ×${need.count}, have ${need.owned}`}
      >
        <span className={units.iconArt}>
          {unit?.thumb ? (
            <Image
              src={unit.thumb}
              alt=""
              width={THUMB_ART_SIZE.width}
              height={THUMB_ART_SIZE.height}
              className={units.thumb}
              unoptimized
              draggable={false}
            />
          ) : (
            <span className={units.iconInitial}>{need.name.charAt(0)}</span>
          )}
        </span>
        {unit?.element ? (
          <UiImage name={`unit-frame-${unit.element}`} className={units.iconFrame} />
        ) : null}
        {need.count > 1 ? (
          <span className={`${units.stackCount} ${units.outline}`} aria-hidden>
            ×{need.count}
          </span>
        ) : null}
      </span>
      <span className={`${evolve.have} ${units.outline}`} aria-hidden>
        Have {need.owned}
      </span>
    </li>
  );
}

/**
 * The Evolve Unit screen (M4-02C; restyled as the original's Evolve Unit in M4-06L, ART_GUIDE → UI
 * → Evolve screen): the current form's idle sprite with its Lv/HP/ATK/DEF/REC plates, a gold arrow,
 * the next form as a white silhouette with ???? plates, the Evolution Materials panel with "Have N"
 * per material, and a bottom bar with the Evolve button, Zel Cost, and a red status strip when
 * blocked. Owned units, stacks (spent first, M4-05C), squads, items, and Zel are read under RLS;
 * the button calls the `evolve` RPC through a Server Action. The page never writes inventory.
 */
export default async function EvolvePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=/units`);
  if (!isOwnedUnitId(id)) notFound();

  const [ownedResult, stacksResult, squadsResult, itemsResult, walletResult] = await Promise.all([
    supabase
      .from("owned_units")
      .select(OWNED_UNIT_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<OwnedUnitRow[], { merge: false }>(),
    supabase
      .from("owned_unit_stacks")
      .select(UNIT_STACK_COLUMNS)
      .eq("user_id", userId)
      .gt("count", 0)
      .overrideTypes<UnitStackRow[], { merge: false }>(),
    supabase
      .from("squads")
      .select("unit_ids, ally_unit_id")
      .eq("user_id", userId)
      .overrideTypes<SquadUseRow[], { merge: false }>(),
    supabase
      .from("owned_items")
      .select("item_id, count")
      .eq("user_id", userId)
      .overrideTypes<OwnedItemRow[], { merge: false }>(),
    supabase.from("wallets").select("zel").eq("user_id", userId).maybeSingle<{ zel: number }>(),
  ]);
  const owned = ownedResult.data ?? [];
  const target = owned.find((row) => row.id === id);
  if (!ownedResult.error && !target) notFound();

  const loadFailed =
    ownedResult.error ||
    stacksResult.error ||
    squadsResult.error ||
    itemsResult.error ||
    walletResult.error;
  const plan =
    target && !loadFailed
      ? evolutionPlan(
          target,
          owned,
          squadsResult.data ?? [],
          itemsResult.data ?? [],
          Number(walletResult.data?.zel ?? 0),
          stacksResult.data ?? [],
        )
      : null;
  const name = target ? (unitContent(target.unit_id)?.name ?? target.unit_id) : "Unit";
  const view = target ? toOwnedUnitView(target) : null;
  const stats = view?.currentStats ?? null;
  const fmt = (value: number | undefined): string =>
    value === undefined ? "–" : value.toLocaleString("en-US");
  const currentPlates: PlateRow[] = [
    ["Lv.", view?.maxLevel ? `${view.level}/${view.maxLevel}` : String(view?.level ?? "–")],
    ["HP", fmt(stats?.hp)],
    ["ATK", fmt(stats?.atk)],
    ["DEF", fmt(stats?.def)],
    ["REC", fmt(stats?.rec)],
  ];
  const nextPlates: PlateRow[] = [
    ["Lv.", "??/??"],
    ["HP", "????"],
    ["ATK", "????"],
    ["DEF", "????"],
    ["REC", "????"],
  ];
  const blockers = plan ? evolveBlockers(plan) : [];

  return (
    <div className={units.listPage}>
      <header className={units.titleBar}>
        <Link href={`/units/${id}`} className={`${units.pill} ${units.backButton}`}>
          <span className={units.outline}>Back</span>
        </Link>
        <div className={units.titlePlate}>
          <UiImage name="title-plate" className={units.titlePlateArt} />
          <div className={units.titleText} style={textBoxStyle("title-plate")}>
            <h1 className={units.outline}>Evolve Unit</h1>
          </div>
        </div>
      </header>

      {loadFailed ? (
        <div className={evolve.body}>
          <p className={evolve.message}>This unit could not be loaded. Try again shortly.</p>
        </div>
      ) : !plan ? (
        <div className={evolve.body}>
          <p className={evolve.message}>{name} cannot evolve any further.</p>
        </div>
      ) : (
        <>
          <div className={evolve.body}>
            <section className={evolve.stage} aria-label={`${name} evolution`}>
              <Plates rows={currentPlates} label={`${name}, current stats`} />
              <FormSprite form={plan.from} alt={`${name}, ${plan.from.rarityLabel} form`} />
              <span className={evolve.arrow} aria-hidden />
              <FormSprite
                form={plan.next}
                alt={`${name}, unknown ${plan.next.rarityLabel} form`}
                silhouette
              />
              <Plates rows={nextPlates} label="Next form's stats, unknown" />
            </section>

            <section className={evolve.panel} aria-labelledby="evolve-materials">
              <h2 id="evolve-materials" className={`${evolve.panelTitle} ${units.outline}`}>
                Evolution Materials
              </h2>
              <ul className={evolve.materials}>
                {plan.units.map((need) => (
                  <MaterialIcon key={need.unitId} need={need} />
                ))}
                {plan.items.map((need) => (
                  <MaterialIcon key={need.itemId} need={need} />
                ))}
              </ul>
              {plan.problems.length > 0 ? (
                <ul className={evolve.problems}>
                  {plan.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              ) : (
                <p className={evolve.problems}>
                  The materials above are spent. {name} returns to level 1 in the new form.
                </p>
              )}
            </section>
          </div>

          <EvolveButton
            unitId={id}
            materialIds={plan.materialIds}
            materialStacks={plan.materialStacks}
            label={plan.omni ? "Omni Evolve" : "Evolve"}
            zel={plan.zel}
            blockers={blockers}
          />
        </>
      )}

      <p className={menu.ticker}>
        {plan ? "Gather the materials and Zel to evolve." : "Select a unit to evolve."}
      </p>
    </div>
  );
}
