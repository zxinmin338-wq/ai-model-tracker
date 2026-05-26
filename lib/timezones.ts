/**
 * UTC hour → multi-timezone label conversion.
 * No external date library — uses Intl.DateTimeFormat.
 */

export function utcHourToTimezones(utcHour: number): {
  beijing: string;
  us_east: string;
  us_west: string;
  central_europe: string;
} {
  // Create a date at the given UTC hour
  const d = new Date(Date.UTC(2026, 0, 1, utcHour, 0, 0));

  const fmt = (tz: string) => {
    const f = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    });
    return f.format(d);
  };

  return {
    beijing: fmt("Asia/Shanghai"),
    us_east: fmt("America/New_York"),
    us_west: fmt("America/Los_Angeles"),
    central_europe: fmt("Europe/Berlin"),
  };
}

export function formatTimezoneLabel(utcHour: number): string {
  const tz = utcHourToTimezones(utcHour);
  return `UTC ${String(utcHour).padStart(2, "0")}:00 / Beijing ${tz.beijing} / ET ${tz.us_east} / PT ${tz.us_west} / CET ${tz.central_europe}`;
}
