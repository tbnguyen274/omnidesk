import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Importing a CLI from a test must not start its command. */
export function isMainModule(moduleUrl: string): boolean {
  return (
    process.argv[1] !== undefined &&
    pathToFileURL(resolve(process.argv[1])).href === moduleUrl
  );
}
