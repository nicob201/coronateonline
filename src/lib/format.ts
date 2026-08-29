// Formats an integer ARS amount as "$50.000" (es-AR grouping, no decimals).
export function formatARS(amount: number): string {
  return `$${amount.toLocaleString("es-AR")}`;
}

// Formats the elapsed time between two instants as "4 días 17 horas" / "2 días" / "5 horas".
export function formatReignDuration(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const totalMinutes = Math.max(0, Math.floor((end - start) / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);

  if (days > 0) {
    const d = `${days} ${days === 1 ? "día" : "días"}`;
    return hours > 0 ? `${d} ${hours} ${hours === 1 ? "hora" : "horas"}` : d;
  }
  if (hours > 0) return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  return "menos de 1 hora";
}
