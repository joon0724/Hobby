import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const id = process.argv[2];
if (!/^appgprj_[A-Za-z0-9]+$/.test(id || ""))
  throw Error("본인의 Sites project_id를 인자로 지정하세요.");
const directory = resolve(import.meta.dirname, "../.openai");
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, "hosting.local.json"),
  JSON.stringify({ d1: null, r2: null, project_id: id }, null, 2),
);
console.log(
  "로컬 호스팅 연결을 저장했습니다. 이 파일은 Git에 포함하지 마세요.",
);
