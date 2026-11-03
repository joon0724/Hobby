import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { getCurrentFuseWire, FuseV1Options, FuseState } from "@electron/fuses";
import { verifySignature } from "./sign-windows.mjs";
export async function verifyPackage(directory, { signed = false } = {}) {
  const exe = join(directory, "Ultron.exe"),
    wire = await getCurrentFuseWire(exe);
  for (const [name, on] of [
    ["RunAsNode", false],
    ["EnableNodeOptionsEnvironmentVariable", false],
    ["EnableNodeCliInspectArguments", false],
    ["EnableEmbeddedAsarIntegrityValidation", true],
    ["OnlyLoadAppFromAsar", true],
    ["GrantFileProtocolExtraPrivileges", false],
  ]) {
    if (
      wire[FuseV1Options[name]] !== (on ? FuseState.ENABLE : FuseState.DISABLE)
    )
      throw Error("Unexpected fuse: " + name);
  }
  const sums = (await readFile(join(directory, "SHA256SUMS.txt"), "utf8"))
    .trim()
    .split(/\r?\n/);
  for (const name of ["Ultron.exe", "resources/app.asar"]) {
    const row = sums.find((s) => s.endsWith("  " + name));
    if (!row) throw Error("Missing checksum: " + name);
    const hash = createHash("sha256")
      .update(await readFile(join(directory, name)))
      .digest("hex");
    if (row.split(" ")[0] !== hash) throw Error("Checksum mismatch: " + name);
  }
  if (signed) await verifySignature(exe);
  return { fuses: true, checksums: true, signed };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (!process.argv[2]) throw Error("배포 폴더를 지정하세요.");
  console.log(
    JSON.stringify(
      await verifyPackage(resolve(process.argv[2]), {
        signed: process.argv.includes("--signed"),
      }),
    ),
  );
}
