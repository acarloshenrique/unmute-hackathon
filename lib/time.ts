import { DateTime } from "luxon";
import { DomainError } from "./auth";
export const ZONE = "America/Sao_Paulo";
export function localToUtc(local: string): string {
  const date = DateTime.fromISO(local, { zone: ZONE });
  if (!date.isValid || /Z$|[+-]\d\d:\d\d$/.test(local))
    throw new DomainError(
      "INVALID_TIME",
      "Informe data e hora local válidas de São Paulo.",
    );
  return date.toUTC().toISO()!;
}
export function isQuiet(instant: string) {
  const hour = DateTime.fromISO(instant).setZone(ZONE).hour;
  return hour < 8 || hour >= 21;
}
export function nextDaily(time: string, after: string) {
  const [hour, minute] = time.split(":").map(Number);
  if (!/^\d{2}:\d{2}$/.test(time) || hour > 23 || minute > 59)
    throw new DomainError("INVALID_TIME", "Horário inválido.");
  const local = DateTime.fromISO(after).setZone(ZONE);
  let next = local.set({ hour, minute, second: 0, millisecond: 0 });
  if (next <= local) next = next.plus({ days: 1 });
  return next.toUTC().toISO()!;
}
export function formatTime(instant: string) {
  return DateTime.fromISO(instant).setZone(ZONE).toFormat("dd/MM HH:mm");
}
