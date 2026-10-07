import type { OriginalAsset } from "../original/original-assets.ts";
import type { SphereSlot, SphereSocketView } from "./spheres.ts";

/** Original Equip Sphere pieces (M8-09); positions come from layouts/spheres.json. */
export const SPHERE_EQUIP_ASSETS = {
  row: "common/list_frame1.png",
  thumbBase: "common/item_frame_bg.png",
  thumbFrame: "common/item_frame_0.png",
  typeIcon: "common/sphere_icon/up.png",
  squareNormal: "common/button/sub_square2_btn1.png",
  squarePressed: "common/button/sub_square2_btn2.png",
  equipNormal: "item_sphere_eqp/eqp_btn_label1.png",
  equipPressed: "item_sphere_eqp/eqp_btn_label2.png",
  removeNormal: "common/button/label/sub_square2_btn_undo_label1.png",
  removePressed: "common/button/label/sub_square2_btn_undo_label2.png",
  socketBase: "common/skill_frame_bg.png",
  socket: "common/skill_frame_0.png",
  emptySphere: "common/sphere_icon_off.png",
} as const satisfies Record<string, OriginalAsset>;

/** The slot Equip and Remove act on when the screen opens: the first empty one, else slot 1. */
export function initialSphereSlot(sockets: readonly SphereSocketView[]): SphereSlot {
  return sockets.find((socket) => socket.unlocked && !socket.sphere)?.slot ?? 1;
}

/** The ticker's help line: one slot needs no slot name; two name the chosen slot. */
export function sphereEquipHint(slotCount: number, slot: SphereSlot): string {
  return slotCount > 1
    ? `Select a Sphere to equip in Slot ${slot}.`
    : "Select a Sphere you wish to equip.";
}
