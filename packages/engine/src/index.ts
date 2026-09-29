import { DATA_SCHEMA_VERSION } from "@bfr/data";

/** Engine version string; ties the engine to the content schema it reads. */
export const ENGINE_VERSION: string = `0.0.0+data${DATA_SCHEMA_VERSION}`;

export * from "./actions/index.ts";
export * from "./ai/index.ts";
export * from "./auto.ts";
export * from "./drops/index.ts";
export * from "./effects/index.ts";
export * from "./events.ts";
export * from "./formulas/index.ts";
export * from "./gauge/index.ts";
export * from "./rng.ts";
export * from "./stages/tutorial.ts";
export * from "./state/index.ts";
export * from "./step.ts";
export * from "./timeline/index.ts";
export * from "./turn.ts";
