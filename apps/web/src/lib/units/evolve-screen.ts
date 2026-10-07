import type { OriginalAsset } from "../original/original-assets.ts";

/** Evolve preparation pieces; positions come from layouts/evolve.json. */
export const EVOLVE_ASSETS = {
  table: "party_edit/unit_table.png",
  arrow: "common/page_feed_arrow_r.png",
  frameLeft: "common/status_frame/status_frame_s_l.png",
  frameCenter: "common/status_frame/status_frame_s_c.png",
  frameRight: "common/status_frame/status_frame_s_r.png",
  materials: "unit_evo/evo_elem_cap.png",
  materialPanel: "common/evolution_material_label/panel.png",
  possible: "unit_evo/evo_possible.png",
  plate: "common/ope_info_frame.png",
  normal: "common/button/sub_m_btn1.png",
  pressed: "common/button/sub_m_btn2.png",
  labelNormal: "unit_evo/unit_evo_btn_label1.png",
  labelPressed: "unit_evo/unit_evo_btn_label2.png",
} as const satisfies Record<string, OriginalAsset>;
