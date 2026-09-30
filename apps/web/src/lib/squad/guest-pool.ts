import { GuestSchema, resolveGuest, type Unit } from "@bfr/data";
import aurelle from "@bfr/data/content/guests/aurelle.json";
import vespera from "@bfr/data/content/guests/vespera.json";
import { type OwnedUnitRow, toOwnedUnitView, unitContent } from "../units/owned-units.ts";

export const GUEST_POOL = [aurelle, vespera].map((json) => GuestSchema.parse(json));

/** Current display estimates. Only the guest id is submitted to save_squad. */
export function guestPreviews(
  owned: readonly OwnedUnitRow[],
): ReturnType<typeof toOwnedUnitView>[] {
  const units = new Map<string, Unit>();
  for (const id of [...owned.map((row) => row.unit_id), ...GUEST_POOL.map((guest) => guest.unit)]) {
    const unit = unitContent(id);
    if (unit) units.set(id, unit);
  }
  const progress = owned.map((row) => ({
    unitId: row.unit_id,
    formId: row.form_id,
    level: row.level,
  }));
  return GUEST_POOL.flatMap((guest) => {
    const resolved = resolveGuest(guest, progress, units);
    return resolved
      ? [
          toOwnedUnitView({
            id: guest.id,
            unit_id: guest.unit,
            form_id: resolved.form.id,
            level: resolved.level,
            exp: 0,
            unit_type: null,
          }),
        ]
      : [];
  });
}
