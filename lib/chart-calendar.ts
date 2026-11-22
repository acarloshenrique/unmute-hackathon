import type { Visit } from "./chart-model";

const instant = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}/, "");
const escapeText = (s: string) =>
  s
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");

function fold(line: string) {
  const encoder = new TextEncoder();
  let output = "",
    length = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (length + size > 75) {
      output += "\r\n ";
      length = 1;
    }
    output += ch;
    length += size;
  }
  return output;
}
export function visitCalendar(v: Visit, generatedAt: string) {
  function event(
    uid: string,
    title: string,
    start: string,
    alarm: string,
    description: string,
  ) {
    return [
      "BEGIN:VEVENT",
      "UID:" + uid + "@carecircle",
      "DTSTAMP:" + instant(generatedAt),
      "DTSTART:" + instant(start),
      "SUMMARY:" + escapeText(title),
      "LOCATION:" + escapeText(v.location),
      "DESCRIPTION:" + escapeText(description),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER;VALUE=DATE-TIME:" + instant(alarm),
      "DESCRIPTION:" + escapeText(title),
      "END:VALARM",
      "END:VEVENT",
    ];
  }
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CareCircle//Agenda familiar//PT-BR",
    "CALSCALE:GREGORIAN",
    ...event(
      v.id,
      v.title,
      v.scheduled_at,
      v.reminder_at,
      v.kind + " · Fonte: " + v.source,
    ),
  ];
  for (const s of v.steps.filter((s) => !s.completed_at))
    lines.push(
      ...event(
        s.id,
        "Preparo · " + v.title,
        s.due_at,
        s.due_at,
        s.instruction + " · Fonte: " + v.source,
      ),
    );
  return [...lines, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
