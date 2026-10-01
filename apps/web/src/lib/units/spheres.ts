/**
 * The Equip Sphere screen's view model (M4-06J; ART_GUIDE → UI → Equip Sphere, GAME_DESIGN §6 →
 * Spheres). Pure: the pages read `owned_spheres` and `unit_spheres` under RLS and pass the rows in;
 * every change goes through the `equip_sphere` RPC (M4-04A).
 */
import { type Sphere, sphereContent } from "@bfr/data";
import { unitContent } from "./owned-units.ts";

export const SPHERE_SLOTS = [1, 2] as const;
export type SphereSlot = (typeof SPHERE_SLOTS)[number];

export const OWNED_SPHERE_COLUMNS = "id, sphere_id, created_at";
export type OwnedSphereRow = { id: string; sphere_id: string; created_at: string };

export const UNIT_SPHERE_COLUMNS = "owned_unit_id, slot, owned_sphere_id";
export type UnitSphereRow = { owned_unit_id: string; slot: number; owned_sphere_id: string };

export type SphereView = {
  /** The `owned_spheres` row id, which `equip_sphere` takes. */
  id: string;
  sphereId: string;
  name: string;
  /** "All-stat" or "Signature · <unit>". */
  kindLabel: string;
  /** A one-line effect summary, e.g. "HP, ATK +30% · +1 effect". */
  summary: string;
};

export type SphereSocketView = {
  slot: SphereSlot;
  /** False for slot 2 until the unit's second slot is unlocked; locked sockets are not shown. */
  unlocked: boolean;
  sphere: SphereView | null;
};

export type OwnedSphereEntry = SphereView & {
  /** Where it is equipped: this unit's slot, another unit, or nowhere. */
  equipped: { onThisUnit: true; slot: SphereSlot } | { onThisUnit: false } | null;
};

export function isSphereSlot(value: unknown): value is SphereSlot {
  return value === 1 || value === 2;
}

const STAT_LABELS: Record<string, string> = { hp: "HP", atk: "ATK", def: "DEF", rec: "REC" };

/** Stat boosts grouped by value ("All stats +20%", "HP, ATK +30%"), then a count of the rest. */
export function sphereSummary(sphere: Sphere): string {
  const byValue = new Map<number, string[]>();
  let other = 0;
  for (const effect of sphere.effects) {
    const stat = effect.id === "passive.stat_pct" ? effect.stat : undefined;
    if (stat && STAT_LABELS[stat]) {
      const stats = byValue.get(effect.value) ?? [];
      stats.push(STAT_LABELS[stat]);
      byValue.set(effect.value, stats);
    } else {
      other += 1;
    }
  }
  const parts = [...byValue].map(([value, stats]) => {
    const pct = `+${Math.round(value * 100)}%`;
    return stats.length === 4 ? `All stats ${pct}` : `${stats.join(", ")} ${pct}`;
  });
  if (other > 0) parts.push(`+${other} effect${other === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** One owned sphere row as shown; an unknown sphere id keeps its id as its name. */
export function toSphereView(row: Pick<OwnedSphereRow, "id" | "sphere_id">): SphereView {
  const sphere = sphereContent(row.sphere_id);
  if (!sphere)
    return {
      id: row.id,
      sphereId: row.sphere_id,
      name: row.sphere_id,
      kindLabel: "?",
      summary: "",
    };
  const owner = sphere.signatureUnit ? unitContent(sphere.signatureUnit)?.name : undefined;
  return {
    id: row.id,
    sphereId: row.sphere_id,
    name: sphere.name,
    kindLabel:
      sphere.kind === "signature" ? `Signature · ${owner ?? sphere.signatureUnit}` : "All-stat",
    summary: sphereSummary(sphere),
  };
}

/** The unit's two sockets with what each holds; slot 2 is unlocked only by `second_sphere_slot`. */
export function sphereSockets(
  unitId: string,
  secondSlot: boolean,
  equipment: readonly UnitSphereRow[],
  owned: readonly OwnedSphereRow[],
): SphereSocketView[] {
  const byId = new Map(owned.map((row) => [row.id, row]));
  return SPHERE_SLOTS.map((slot) => {
    const held = equipment.find((e) => e.owned_unit_id === unitId && e.slot === slot);
    const row = held ? byId.get(held.owned_sphere_id) : undefined;
    return { slot, unlocked: slot === 1 || secondSlot, sphere: row ? toSphereView(row) : null };
  });
}

/** Every owned sphere, by name then age, marked with where it is equipped. */
export function ownedSphereEntries(
  unitId: string,
  equipment: readonly UnitSphereRow[],
  owned: readonly OwnedSphereRow[],
): OwnedSphereEntry[] {
  const equippedBy = new Map(equipment.map((e) => [e.owned_sphere_id, e]));
  return [...owned]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((row) => {
      const at = equippedBy.get(row.id);
      const equipped: OwnedSphereEntry["equipped"] = !at
        ? null
        : at.owned_unit_id === unitId && isSphereSlot(at.slot)
          ? { onThisUnit: true, slot: at.slot }
          : { onThisUnit: false };
      return { ...toSphereView(row), equipped };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The `equip_sphere` refusals (M4-04A) as player-facing messages. */
export function equipSphereErrorMessage(code: string | undefined, message: string): string {
  if (code !== "22023") return "The sphere could not be equipped.";
  const reason = message.replace(/^equip_sphere: /, "");
  switch (reason) {
    case "second slot locked":
      return "This unit's second sphere slot is locked.";
    case "sphere not owned or unknown":
      return "You do not own that sphere.";
    case "sphere already equipped":
      return "That sphere is already equipped on another unit or slot.";
    case "two all-stat spheres refused":
      return "A unit cannot equip two all-stat spheres.";
    case "unit not owned":
      return "You do not own that unit.";
    default:
      return reason.charAt(0).toUpperCase() + reason.slice(1);
  }
}
