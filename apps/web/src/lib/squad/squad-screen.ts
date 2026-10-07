/** Manage Squad original pieces (M8-06), positioned by layouts/squad.json. */
import type { OriginalAsset } from "../original/original-assets.ts";

export const SQUAD_ASSETS = {
  baseNormal: "common/button/sub_square2_btn1.png",
  basePressed: "common/button/sub_square2_btn2.png",
  pedestal: "party_edit/unit_table.png",
  cost: "party_edit/plate_total_cost.png",
  leaderNormal: "party_edit/leader_change_btn_label1.png",
  leaderPressed: "party_edit/leader_change_btn_label2.png",
  detailNormal: "party_edit/party_detail_btn_label1.png",
  detailPressed: "party_edit/party_detail_btn_label2.png",
  arrowLeft: "common/page_feed_arrow_l.png",
  arrowRight: "common/page_feed_arrow_r.png",
  dotOn: "home/home_position_mark/on.png",
  dotOff: "home/home_position_mark/off.png",
  skill: "common/leader_burst_label/leader.png",
  frameLeft: "common/status_frame/status_frame_m_l.png",
  frameCenter: "common/status_frame/status_frame_m_c.png",
  frameRight: "common/status_frame/status_frame_m_r.png",
  level: "party_edit/party_status_char_short/lv.png",
  hp: "party_edit/party_status_char_short/hp.png",
} as const satisfies Record<string, OriginalAsset>;
