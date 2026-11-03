import { packager } from "@electron/packager";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";
import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { withPackagingStage, requireNewOutput } from "./package-utils.mjs";
import { signWindows, signingConfigured } from "./sign-windows.mjs";
import { verifyPackage } from "./verify-package.mjs";
const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const output = resolve(
  process.env.ULTRON_PACKAGE_OUTPUT || join(root, "release", pkg.version),
);
const signed = process.argv.includes("--signed");
if (signed && !signingConfigured())
  throw Error(
    "서명 인증서/서비스가 설정되지 않았습니다. 서명 배포를 중단합니다.",
  );
await requireNewOutput(output);
await import("./build.mjs");
await withPackagingStage(root, async (owned) => {
  const stage = join(owned, "app");
  await mkdir(stage, { recursive: true });
  await Promise.all(
    ["desktop", "dist/server", "dist/shared"].map((p) =>
      mkdir(join(stage, p), { recursive: true }),
    ),
  );
  for (const p of [
    "desktop/main.cjs",
    "desktop/preload.cjs",
    "desktop/data-store.cjs",
    "desktop/file-ops.cjs",
    "desktop/security.cjs",
    "dist/widget.html",
    "dist/server/providers.mjs",
    "dist/shared/conversation.mjs",
  ])
    await copyFile(join(root, p), join(stage, p));
  await writeFile(
    join(stage, "package.json"),
    JSON.stringify({
      name: "ultron-widget",
      version: pkg.version,
      main: "desktop/main.cjs",
      description: pkg.description,
      author: "Ultron",
      private: true,
    }),
  );
  const paths = await packager({
    dir: stage,
    tmpdir: join(owned, "packager-tmp"),
    out: output,
    name: "Ultron",
    platform: "win32",
    arch: "x64",
    electronVersion: pkg.devDependencies.electron,
    download: {
      cacheRoot: resolve(
        process.env.ULTRON_ELECTRON_CACHE || join(root, ".cache", "electron"),
      ),
    },
    asar: true,
    overwrite: false,
    prune: true,
    win32metadata: {
      ProductName: "Ultron",
      FileDescription: "Ultron personal voice widget",
    },
  });
  for (const directory of paths) {
    const exe = join(directory, "Ultron.exe");
    await flipFuses(exe, {
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    });
    if (signed) await signWindows(directory);
    const checks = [];
    for (const name of ["Ultron.exe", "resources/app.asar"])
      checks.push(
        createHash("sha256")
          .update(await readFile(join(directory, name)))
          .digest("hex") +
          "  " +
          name,
      );
    await writeFile(
      join(directory, "SHA256SUMS.txt"),
      checks.join("\n") + "\n",
    );
  }
  for (const directory of paths) {
    await verifyPackage(directory, { signed });
    await writeFile(
      join(directory, "release-info.json"),
      JSON.stringify({ version: pkg.version, signed, verified: true }, null, 2),
    );
  }
  console.log(paths.join("\n"));
});
