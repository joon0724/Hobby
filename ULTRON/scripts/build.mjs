import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const read = async (p) =>
  (await readFile(resolve(root, p), "utf8")).replace(/\r\n/g, "\n");
const [
  html,
  css,
  app,
  server,
  core,
  connections,
  storage,
  conversation,
  commands,
  providers,
] = await Promise.all(
  [
    "ui/index.html",
    "ui/style.css",
    "ui/app.js",
    "worker/index.js",
    "ui/core3d.js",
    "ui/connections.js",
    "ui/storage.js",
    "shared/conversation.mjs",
    "shared/commands.mjs",
    "worker/providers.mjs",
  ].map(read),
);
const unexport = (s) => s.replace(/^export /gm, "");
const script = app
  .replace("/*__CORE3D__*/", () => core)
  .replace("/*__CONNECTIONS__*/", () => connections)
  .replace("/*__STORAGE__*/", () => storage)
  .replace(
    "/*__SHARED__*/",
    () => unexport(conversation) + "\n" + unexport(commands),
  );
const styleHash = createHash("sha256").update(css).digest("base64");
const access = await read("worker/access.mjs");
const scriptHash = createHash("sha256").update(script).digest("base64");
const policy = (connect) =>
  `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${styleHash}'; style-src-attr 'none'; font-src 'self'; connect-src ${connect}; img-src 'self' data:; media-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'`;
const page = html
  .replace(/<style>[\s\S]*?<\/style>/, () => "<style>" + css + "</style>")
  .replace(
    /<script>[\s\S]*?<\/script>/,
    () => "<script>" + script + "</script>",
  );
await Promise.all(
  ["dist/server", "dist/shared", "dist/.openai"].map((p) =>
    mkdir(resolve(root, p), { recursive: true }),
  ),
);
const bundledServer = server.replace(
  /^import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/providers\.mjs['"];?\s*/,
  () =>
    unexport(conversation) +
    "\n" +
    unexport(
      providers.replace(
        /^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+conversation\.mjs['"];?\s*/,
        "",
      ),
    ) +
    "\n",
);
await writeFile(
  resolve(root, "dist/server/index.js"),
  bundledServer
    .replace("/*__WEB_ACCESS__*/", () =>
      access.replace(/^export (?!class UltronRateLimiter)/gm, ""),
    )
    .replace(/['"]__ULTRON_PAGE__['"]/, () => JSON.stringify(page))
    .replace(/['"]__ULTRON_CSP__['"]/, () =>
      JSON.stringify(policy("'self'") + "; frame-ancestors 'none'"),
    ),
);
await copyFile(
  resolve(root, "worker/providers.mjs"),
  resolve(root, "dist/server/providers.mjs"),
);
await copyFile(
  resolve(root, "shared/conversation.mjs"),
  resolve(root, "dist/shared/conversation.mjs"),
);
const widget = page
  .replace(
    "<head>",
    '<head><meta http-equiv="Content-Security-Policy" content="' +
      policy("'none'") +
      '">',
  )
  .replace("<body>", '<body class="desktop-widget">');
await writeFile(resolve(root, "dist/widget.html"), widget);
let manifest = JSON.parse(await read(".openai/hosting.json"));
try {
  manifest = JSON.parse(await read(".openai/hosting.local.json"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
if (
  process.argv.includes("--hosting") &&
  !/^appgprj_[A-Za-z0-9]+$/.test(manifest.project_id || "")
)
  throw Error(
    "호스팅 연결이 없습니다. npm run hosting:configure -- 본인_project_id 를 먼저 실행하세요.",
  );
await writeFile(
  resolve(root, "dist/.openai/hosting.json"),
  JSON.stringify(manifest, null, 2),
);
console.log("Built Ultron: embedded UI + server API");
