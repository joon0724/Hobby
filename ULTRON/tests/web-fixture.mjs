import rawWorker, { UltronRateLimiter } from "../dist/server/index.js";
export function createNamespace() {
  const objects = new Map();
  return {
    objects,
    idFromName: (name) => name,
    get(id) {
      if (!objects.has(id)) {
        const values = new Map();
        let tail = Promise.resolve();
        const tx = {
          get: async (k) => structuredClone(values.get(k)),
          put: async (k, v) => values.set(k, structuredClone(v)),
          delete: async (k) => values.delete(k),
        };
        const storage = {
          transaction: (run) => {
            const task = tail.then(() => run(tx));
            tail = task.catch(() => {});
            return task;
          },
          setAlarm: async () => {},
        };
        objects.set(id, new UltronRateLimiter({ storage }));
      }
      return {fetch:(url,options)=>objects.get(id).fetch(new Request(url,options))};
    },
  };
}
export function createWebFixture() {
  const namespace = createNamespace();
  return {
    namespace,
    fetch(request, extraEnv = {}, options = {}) {
      if (options.ip) request.headers.set("CF-Connecting-IP", options.ip);
      else request.headers.set("CF-Connecting-IP", "192.0.2.1");
      Object.defineProperty(request, "cf", {
        value: { colo: "TEST" },
        configurable: true,
      });
      const env = {
        ULTRON_PUBLIC_ORIGIN: "https://ultron.test",
        ULTRON_ACCESS_AUD: "test-audience",
        ULTRON_LIMITER: namespace,
        ...extraEnv,
      };
      const ctx =
        options.authenticated === false
          ? {}
          : { access: { aud: "test-audience" } };
      return rawWorker.fetch(request, env, ctx);
    },
  };
}
export const trustedWorker = createWebFixture();
