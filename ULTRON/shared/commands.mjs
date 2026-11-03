export function parseLocalCommand(text) {
  const clean = text
    .trim()
    .replace(/^(?:울트론|ultron)(?:[,\s]+|$)/i, "")
    .replace(/[.!?。？！]+$/, "")
    .trim();
  const note =
    clean.match(/^(?:메모|기록|note)\s*[:：]\s*([\s\S]*)$/i) ||
    clean.match(/^(?:메모해\s*줘|기억해\s*줘|메모해)\s+([\s\S]+)$/);
  if (note) return { type: "save-note", value: note[1].trim() };
  if (
    /^(?:메모|notes|메모\s*(?:목록\s*(?:보여\s*줘|알려\s*줘)?|보여\s*줘|확인)|기록\s*보여\s*줘)$/i.test(
      clean,
    )
  )
    return { type: "notes" };
  if (/^(?:시스템\s*(?:상태|확인)|system check|연결\s*상태)$/i.test(clean))
    return { type: "status" };
  if (
    /^(?:(?:지금|현재)\s*)?(?:몇\s*시(?:야|예요|인가요)?|시간(?:\s*알려\s*줘)?|what time(?: is it)?)$/i.test(
      clean,
    )
  )
    return { type: "time" };
  if (
    /^(?:(?:오늘|지금)\s*)?(?:날짜(?:(?:가|는)?\s*(?:뭐야|뭔가요|무엇(?:이야|인가요))|\s*알려\s*줘)?|며칠(?:이야|인가요)?|몇\s*일(?:이야|인가요)?|date today)$/i.test(
      clean,
    )
  )
    return { type: "date" };
  if (
    /^(?:도움말|help|기능|기능\s*(?:안내|목록)|(?:뭘|무엇을)\s*할\s*수\s*있(?:어|나요)|capabilities)$/i.test(
      clean,
    )
  )
    return { type: "help" };
  if (/^(?:안녕|하이|hello|hi)$/i.test(clean)) return { type: "hello" };
  return null;
}
