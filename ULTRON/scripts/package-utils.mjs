import { mkdtemp, mkdir, rm, access } from "node:fs/promises";
import { resolve, join } from "node:path";
export async function requireNewOutput(output) {
  try {
    await access(join(output, "Ultron-win32-x64"));
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  throw Error(
    "배포 폴더가 이미 있습니다. 다른 ULTRON_PACKAGE_OUTPUT 경로를 지정하거나 버전을 올려 주세요. 기존 파일은 변경하지 않았습니다.",
  );
}
export async function withPackagingStage(root, run) {
  const parent = resolve(root, ".build");
  await mkdir(parent, { recursive: true });
  const owned = await mkdtemp(join(parent, "desktop-"));
  try {
    return await run(owned);
  } finally {
    if (resolve(owned, "..") !== parent)
      throw Error("Unexpected staging directory");
    await rm(owned, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}
