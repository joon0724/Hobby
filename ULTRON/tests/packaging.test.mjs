import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  withPackagingStage,
  requireNewOutput,
} from "../scripts/package-utils.mjs";
const parent = resolve(import.meta.dirname, "../.build/package-tests");
test("package staging is cleaned on success and exceptions; existing output is untouched", async () => {
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "case-"));
  try {
    await withPackagingStage(root, async (dir) =>
      writeFile(join(dir, "dummy"), "ok"),
    );
    assert.deepEqual(await readdir(join(root, ".build")), []);
    await assert.rejects(
      withPackagingStage(root, async (dir) => {
        await writeFile(join(dir, "dummy"), "failed");
        throw Error("simulated packaging failure");
      }),
      /simulated/,
    );
    assert.deepEqual(await readdir(join(root, ".build")), []);
    const output = join(root, "release");
    await mkdir(join(output, "Ultron-win32-x64"), { recursive: true });
    await writeFile(join(output, "Ultron-win32-x64", "keep.txt"), "original");
    await assert.rejects(requireNewOutput(output), /이미 있습니다/);
    assert.equal(
      await readFile(join(output, "Ultron-win32-x64", "keep.txt"), "utf8"),
      "original",
    );
  } finally {
    assert.equal(resolve(root, ".."), parent);
    await rm(root, { recursive: true, force: true });
  }
});
