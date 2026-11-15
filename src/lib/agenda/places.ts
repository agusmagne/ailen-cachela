/**
 * Coordenadas de ciudades para ubicar en el mapa las fechas del calendario que no traen GEO.
 * Son hechos geográficos (lat/lon aproximadas del centro de la ciudad), no datos de la artista.
 * Si una ciudad no está, la fecha no se dibuja en el mapa (sí aparece en la lista): no se inventa nada.
 */

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** [nombres posibles, país ISO, lat, lon] */
const CITIES: readonly (readonly [readonly string[], string, number, number])[] = [
  [['Buenos Aires', 'CABA', 'Capital Federal', 'Ciudad Autónoma de Buenos Aires'], 'AR', -34.6, -58.38],
  [['Córdoba'], 'AR', -31.42, -64.18],
  [['Rosario'], 'AR', -32.95, -60.64],
  [['Mendoza'], 'AR', -32.89, -68.84],
  [['Mar del Plata'], 'AR', -38.0, -57.55],
  [['La Plata'], 'AR', -34.92, -57.95],
  [['Tandil'], 'AR', -37.32, -59.13],
  [['Salta'], 'AR', -24.78, -65.41],
  [['Tucumán', 'San Miguel de Tucumán'], 'AR', -26.82, -65.22],
  [['Neuquén'], 'AR', -38.95, -68.06],
  [['Bariloche', 'San Carlos de Bariloche'], 'AR', -41.13, -71.31],
  [['Ushuaia'], 'AR', -54.8, -68.3],
  [['Montevideo'], 'UY', -34.9, -56.16],
  [['Punta del Este'], 'UY', -34.96, -54.95],
  [['Santiago', 'Santiago de Chile'], 'CL', -33.45, -70.67],
  [['Valparaíso'], 'CL', -33.05, -71.62],
  [['São Paulo', 'Sao Paulo'], 'BR', -23.55, -46.63],
  [['Rio de Janeiro', 'Río de Janeiro'], 'BR', -22.91, -43.17],
  [['Florianópolis'], 'BR', -27.6, -48.55],
  [['Curitiba'], 'BR', -25.43, -49.27],
  [['Asunción'], 'PY', -25.28, -57.63],
  [['La Paz'], 'BO', -16.5, -68.15],
  [['Lima'], 'PE', -12.05, -77.04],
  [['Bogotá', 'Bogota'], 'CO', 4.71, -74.07],
  [['Medellín'], 'CO', 6.24, -75.58],
  [['Quito'], 'EC', -0.18, -78.47],
  [['Ciudad de México', 'Mexico City', 'CDMX', 'México DF'], 'MX', 19.43, -99.13],
  [['Tulum'], 'MX', 20.21, -87.47],
  [['Nueva York', 'New York', 'New York City'], 'US', 40.71, -74.0],
  [['Los Ángeles', 'Los Angeles'], 'US', 34.05, -118.24],
  [['Miami'], 'US', 25.76, -80.19],
  [['Chicago'], 'US', 41.88, -87.63],
  [['Detroit'], 'US', 42.33, -83.05],
  [['Toronto'], 'CA', 43.65, -79.38],
  [['Madrid'], 'ES', 40.42, -3.7],
  [['Barcelona'], 'ES', 41.39, 2.17],
  [['Valencia'], 'ES', 39.47, -0.38],
  [['Ibiza'], 'ES', 38.91, 1.43],
  [['Lisboa', 'Lisbon'], 'PT', 38.72, -9.14],
  [['Oporto', 'Porto'], 'PT', 41.15, -8.61],
  [['París', 'Paris'], 'FR', 48.86, 2.35],
  [['Londres', 'London'], 'GB', 51.51, -0.13],
  [['Berlín', 'Berlin'], 'DE', 52.52, 13.4],
  [['Hamburgo', 'Hamburg'], 'DE', 53.55, 9.99],
  [['Colonia', 'Cologne', 'Köln'], 'DE', 50.94, 6.96],
  [['Ámsterdam', 'Amsterdam'], 'NL', 52.37, 4.9],
  [['Róterdam', 'Rotterdam'], 'NL', 51.92, 4.48],
  [['Bruselas', 'Brussels'], 'BE', 50.85, 4.35],
  [['Zúrich', 'Zurich'], 'CH', 47.37, 8.54],
  [['Viena', 'Vienna'], 'AT', 48.21, 16.37],
  [['Praga', 'Prague'], 'CZ', 50.08, 14.44],
  [['Varsovia', 'Warsaw'], 'PL', 52.23, 21.01],
  [['Milán', 'Milan'], 'IT', 45.46, 9.19],
  [['Roma', 'Rome'], 'IT', 41.9, 12.5],
  [['Estambul', 'Istanbul'], 'TR', 41.01, 28.98],
  [['Tiflis', 'Tbilisi'], 'GE', 41.72, 44.79],
  [['Ciudad del Cabo', 'Cape Town'], 'ZA', -33.92, 18.42],
  [['Tokio', 'Tokyo'], 'JP', 35.68, 139.69],
  [['Sídney', 'Sydney'], 'AU', -33.87, 151.21],
];

const index = new Map<string, { lat: number; lon: number; cc: string }>();
for (const [names, cc, lat, lon] of CITIES) for (const n of names) index.set(norm(n), { lat, lon, cc });

/** Coordenadas de una ciudad por nombre (es/en, sin acentos ni mayúsculas); `cc` desambigua si se conoce el país. */
export function cityCoords(city: string | null | undefined, cc?: string | null): { lat: number; lon: number } | null {
  if (!city) return null;
  const hit = index.get(norm(city));
  if (!hit) return null;
  if (cc && hit.cc !== cc.toUpperCase()) return null;
  return { lat: hit.lat, lon: hit.lon };
}
