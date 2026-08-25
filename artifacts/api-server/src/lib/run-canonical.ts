import type { GauntletRun } from "./gauntlet";

/**
 * PostgreSQL JSONB/text cannot represent U+0000 or malformed UTF-16. Runs are
 * canonicalized before they are returned, digested or persisted so every
 * API/storage/export surface observes the same explicit escaped evidence.
 */
export function databaseSafeValue(value: unknown): unknown {
  if (typeof value === "string") {
    let safe = "";
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code === 0) {
        safe += "\\u0000";
        continue;
      }
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          safe += value[index] + value[index + 1];
          index += 1;
        } else {
          safe += `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
        }
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) {
        safe += `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
        continue;
      }
      safe += value[index];
    }
    return safe;
  }
  if (Array.isArray(value)) return value.map(databaseSafeValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        databaseSafeValue(key) as string,
        databaseSafeValue(item),
      ]),
    );
  }
  return value;
}

export function canonicalizeRunForDatabase(run: GauntletRun): GauntletRun {
  return databaseSafeValue(run) as GauntletRun;
}