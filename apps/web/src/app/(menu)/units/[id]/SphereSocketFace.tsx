import { UI_ASSETS, type UiAsset } from "../../../../components/menu/ui-assets.ts";

/**
 * The `sphere-<id>` UI piece for a sphere content ID, when one is exported (M6-10A). BFR's
 * spheres have no original counterpart, so Unit Info and Equip Sphere (M8-09) keep these icons.
 */
export function sphereIcon(sphereId: string): UiAsset | null {
  const name = `sphere-${sphereId}`;
  return name in UI_ASSETS ? (name as UiAsset) : null;
}
