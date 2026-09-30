import dawnrelay from "../content/spheres/dawnrelay.json";
import duskthorn from "../content/spheres/duskthorn.json";
import emberheart from "../content/spheres/emberheart.json";
import gravewell from "../content/spheres/gravewell.json";
import rootward from "../content/spheres/rootward.json";
import stormcleft from "../content/spheres/stormcleft.json";
import sunshard from "../content/spheres/sunshard.json";
import tideglass from "../content/spheres/tideglass.json";
import vanguardSeal from "../content/spheres/vanguard-seal.json";
import wayfarerSeal from "../content/spheres/wayfarer-seal.json";
import { type Sphere, SphereSchema } from "./schemas/sphere.ts";

/** Bundled catalog shared by clients and replays; inventory stores only these IDs. */
export const SPHERES: readonly Sphere[] = [
  wayfarerSeal,
  vanguardSeal,
  emberheart,
  tideglass,
  rootward,
  stormcleft,
  dawnrelay,
  gravewell,
  sunshard,
  duskthorn,
].map((json) => SphereSchema.parse(json));

export function sphereContent(id: string): Sphere | undefined {
  return SPHERES.find((sphere) => sphere.id === id);
}
