import type { Guest } from "./schemas/guest.ts";
import type { Form, Rarity, Unit } from "./schemas/unit.ts";

export type GuestProgressUnit = { unitId: string; formId: string; level: number };

function rank(rarity: Rarity): number {
  return rarity === "omni" ? 8 : rarity;
}

/** Display preview only; start_battle independently resolves and snapshots the authoritative guest. */
export function resolveGuest(
  guest: Guest,
  owned: readonly GuestProgressUnit[],
  units: ReadonlyMap<string, Unit>,
): { unit: Unit; form: Form; level: number } | null {
  const unit = units.get(guest.unit);
  if (!unit) return null;
  let highestRarity = 0;
  let highestLevel = 1;
  let cap = guest.rarityCap;
  for (const row of owned) {
    const form = units.get(row.unitId)?.forms.find((entry) => entry.id === row.formId);
    if (!form) continue;
    highestRarity = Math.max(highestRarity, rank(form.rarity));
    highestLevel = Math.max(highestLevel, row.level);
    if (row.unitId === guest.unit) cap = Math.max(cap, rank(form.rarity));
  }
  const form = [...unit.forms]
    .filter((entry) => rank(entry.rarity) <= Math.min(highestRarity, cap))
    .sort((a, b) => rank(b.rarity) - rank(a.rarity))[0];
  return form ? { unit, form, level: Math.min(highestLevel, form.maxLevel) } : null;
}
