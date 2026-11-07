/** Waren, die in Lagern liegen und getragen werden */
export type Good = 'holz' | 'bretter' | 'beeren' | 'fisch' | 'korn' | 'brot' | 'kraeuter' | 'werkzeug' | 'stein' | 'algen';

export const GOODS: Good[] = ['holz', 'bretter', 'beeren', 'fisch', 'korn', 'brot', 'kraeuter', 'werkzeug', 'stein', 'algen'];

export const GOOD_LABEL: Record<Good, string> = {
  holz: 'Holz',
  bretter: 'Bretter',
  beeren: 'Beeren',
  fisch: 'Fisch',
  korn: 'Korn',
  brot: 'Brot',
  kraeuter: 'Kräuter',
  werkzeug: 'Werkzeug',
  stein: 'Stein',
  algen: 'Algen',
};

/** Nahrung in der Reihenfolge, in der Bewohner sie essen (das Beste zuerst); Algen mögen nur Molche, Otter haben keine */
export const FOODS: Good[] = ['brot', 'fisch', 'beeren', 'algen'];

/** Kennziffer der getragenen Ware für die Darstellung, 0 = nichts */
export const GOOD_CODE: Record<Good, number> = { holz: 1, beeren: 2, bretter: 3, fisch: 4, korn: 5, brot: 6, kraeuter: 7, werkzeug: 8, stein: 9, algen: 10 };

export type Stock = Record<Good, number>;

export function emptyStock(): Stock {
  return { holz: 0, bretter: 0, beeren: 0, fisch: 0, korn: 0, brot: 0, kraeuter: 0, werkzeug: 0, stein: 0, algen: 0 };
}

/** Fehlende Waren eines gespeicherten Vorrats mit 0 auffüllen */
export function fillStock(src: Partial<Stock> | undefined): Stock {
  const s = emptyStock();
  if (src) for (const g of GOODS) s[g] = src[g] ?? 0;
  return s;
}

/** Kosten als Text, z. B. "8 Holz, 4 Bretter" */
export function costText(cost: Partial<Stock>): string {
  const parts: string[] = [];
  for (const g of GOODS) if (cost[g]) parts.push(`${cost[g]} ${GOOD_LABEL[g]}`);
  return parts.length ? parts.join(', ') : 'kostenlos';
}

export function costTotal(cost: Partial<Stock>): number {
  let s = 0;
  for (const g of GOODS) s += cost[g] ?? 0;
  return s;
}
