/** Límites [[oeste, sur], [este, norte]] que encierran todos los puntos. */
export function limites(puntos: { lat: number; lng: number }[]): [[number, number], [number, number]] | null {
  if (!puntos.length) return null;
  const lats = puntos.map((p) => p.lat);
  const lngs = puntos.map((p) => p.lng);
  const margen = 0.005; // evita un zoom excesivo con un solo punto
  return [
    [Math.min(...lngs) - margen, Math.min(...lats) - margen],
    [Math.max(...lngs) + margen, Math.max(...lats) + margen],
  ];
}

/** "08:00" + 95 min → "09:35" */
export function horaMas(inicio: string | null | undefined, minutos: number): string {
  const [h, m] = (inicio ?? "08:00").split(":").map(Number);
  const total = h * 60 + m + minutos;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
