function partsInTimeZone(timestamp: number, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  );
}

/** Convert a date and clock time entered for a catalog city into the UTC instant sent to the API. */
export function pickupDateTimeToIso(date: string, time: string, timeZone: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return "";

  const [year, month, day, hour, minute] = [dateMatch, timeMatch].flatMap((match) =>
    match.slice(1).map(Number),
  );
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  )
    return "";
  if (
    year < 1000 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  )
    return "";

  try {
    const requestedAsUtc = Date.UTC(year, month - 1, day, hour, minute);
    let candidate = requestedAsUtc;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const local = partsInTimeZone(candidate, timeZone);
      const representedAsUtc = Date.UTC(
        local["year"] ?? 0,
        (local["month"] ?? 1) - 1,
        local["day"] ?? 1,
        local["hour"] ?? 0,
        local["minute"] ?? 0,
      );
      candidate += requestedAsUtc - representedAsUtc;
    }
    const verified = partsInTimeZone(candidate, timeZone);
    if (
      verified["year"] !== year ||
      verified["month"] !== month ||
      verified["day"] !== day ||
      verified["hour"] !== hour ||
      verified["minute"] !== minute
    )
      return "";
    return new Date(candidate).toISOString();
  } catch {
    return "";
  }
}

export function dateInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = partsInTimeZone(date.getTime(), timeZone);
    return `${parts["year"]}-${String(parts["month"]).padStart(2, "0")}-${String(parts["day"]).padStart(2, "0")}`;
  } catch {
    return "";
  }
}
