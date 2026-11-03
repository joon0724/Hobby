const fs = require("node:fs");
const retryable = new Set(["EPERM", "EACCES", "EBUSY"]);
const delays = [25, 75, 150];
function renameWithRetrySync(from, to, rename = fs.renameSync) {
  for (let attempt = 0; ; attempt++) {
    try {
      return rename(from, to);
    } catch (e) {
      if (!retryable.has(e.code) || attempt >= delays.length) throw e;
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        delays[attempt],
      );
    }
  }
}
async function renameWithRetry(from, to, rename = fs.promises.rename) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (e) {
      if (!retryable.has(e.code) || attempt >= delays.length) throw e;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}
module.exports = { renameWithRetry, renameWithRetrySync };
