import { readFile, writeFile } from "node:fs/promises";

const file = new URL("../api-zod/src/generated/api.ts", import.meta.url);
let source = await readFile(file, "utf8");

source = source
  .replaceAll("zod.uuid()", "zod.string().uuid()")
  .replaceAll("zod.email()", "zod.string().email()")
  .replaceAll("zod.int()", "zod.number().int()");

await writeFile(file, source);