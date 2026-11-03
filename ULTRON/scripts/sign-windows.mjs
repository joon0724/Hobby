import { sign } from "@electron/windows-sign";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export function signingConfigured(env = process.env) {
  return !!(env.WINDOWS_CERTIFICATE_FILE || env.WINDOWS_SIGN_WITH_PARAMS);
}
export async function verifySignature(exe) {
  const escaped = exe.replaceAll("'", "''");
  const { stdout } = await exec(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-AuthenticodeSignature -LiteralPath '${escaped}').Status.ToString()`,
    ],
    { windowsHide: true },
  );
  if (stdout.trim() !== "Valid")
    throw Error("Windows Authenticode 서명 검증에 실패했습니다.");
}
export async function signWindows(directory) {
  if (!signingConfigured())
    throw Error(
      "서명 인증서 또는 서명 서비스 설정이 필요합니다. WINDOWS_CERTIFICATE_FILE 또는 WINDOWS_SIGN_WITH_PARAMS를 설정하세요.",
    );
  await sign({
    appDirectory: directory,
    hashes: ["sha256"],
    description: "Ultron personal AI widget",
  });
}
