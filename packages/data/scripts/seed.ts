// Writes supabase/seed.sql and src/content-version.ts from content/. Run after editing content.
import { writeFileSync } from "node:fs";
import {
  contentVersion,
  loadContent,
  renderSeedSql,
  renderVersionModule,
  seedSqlPath,
  versionModulePath,
} from "./content-seed.ts";

const items = loadContent();
const version = contentVersion(items);
writeFileSync(seedSqlPath, renderSeedSql(items, version));
writeFileSync(versionModulePath, renderVersionModule(version));
console.log(`seed: ${items.length} item(s) at content version ${version}`);
