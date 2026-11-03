export const MAX_MESSAGE_CHARS = 6000;
export const MAX_HISTORY_CHARS = 40000;
export const MAX_HISTORY_MESSAGES = 12;
// JSON escaping can require six ASCII bytes for one UTF-16 code unit.
export const MAX_JSON_BYTES = 256 * 1024;

export function boundedHistory(messages) {
  const history = (Array.isArray(messages) ? messages : [])
    .filter(
      (m) =>
        m &&
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_MESSAGE_CHARS),
    }));
  while (
    history.length &&
    (JSON.stringify(history).length > MAX_HISTORY_CHARS ||
      history[0].role !== "user")
  )
    history.shift();
  return history;
}
