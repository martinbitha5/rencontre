import type { City } from '../types';

// Vérification de la ville déclarée par la position réelle, à l'onboarding.
// La règle produit reste « matching par ville déclarée, pas de GPS » : la
// position n'est lue qu'UNE fois, en local, pour proposer la bonne ville.
// Elle n'est jamais stockée ni envoyée au serveur.
//
// Coordonnées des centres-villes des villes servies par l'app (les noms
// doivent correspondre à ceux de la table cities). Une ville absente de cette
// carte est simplement ignorée par la vérification.
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Bandundu: { lat: -3.317, lng: 17.383 },
  Boende: { lat: -0.281, lng: 20.876 },
  Bukavu: { lat: -2.508, lng: 28.861 },
  Bunia: { lat: 1.56, lng: 30.252 },
  Buta: { lat: 2.786, lng: 24.73 },
  Gbadolite: { lat: 4.279, lng: 21.001 },
  Gemena: { lat: 3.257, lng: 19.772 },
  Goma: { lat: -1.679, lng: 29.222 },
  Inongo: { lat: -1.945, lng: 18.288 },
  Isiro: { lat: 2.774, lng: 27.616 },
  Kabinda: { lat: -6.129, lng: 24.483 },
  Kalemie: { lat: -5.947, lng: 29.194 },
  Kamina: { lat: -8.738, lng: 24.991 },
  Kananga: { lat: -5.896, lng: 22.417 },
  Kenge: { lat: -4.837, lng: 17.04 },
  Kindu: { lat: -2.944, lng: 25.923 },
  Kinshasa: { lat: -4.325, lng: 15.322 },
  Kisangani: { lat: 0.515, lng: 25.191 },
  Kolwezi: { lat: -10.717, lng: 25.472 },
  Lisala: { lat: 2.148, lng: 21.513 },
  Lodja: { lat: -3.523, lng: 23.596 },
  Lubumbashi: { lat: -11.661, lng: 27.479 },
  Matadi: { lat: -5.817, lng: 13.463 },
  Mbandaka: { lat: 0.048, lng: 18.26 },
  'Mbuji-Mayi': { lat: -6.15, lng: 23.6 },
  Tshikapa: { lat: -6.416, lng: 20.8 },
};

// Au-delà de ce rayon autour de la ville la plus proche, on considère qu'on
// ne sait pas trancher (zone rurale, GPS imprécis) et on ne contredit pas le
// choix de la personne.
const MAX_MATCH_KM = 80;

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// La ville de la liste la plus proche de la position, si elle est assez
// proche pour être crédible. null = position trop loin de toute ville connue.
export function nearestCity(cities: City[], lat: number, lng: number): City | null {
  let best: City | null = null;
  let bestKm = Infinity;
  for (const c of cities) {
    const coords = CITY_COORDS[c.name];
    if (!coords) continue;
    const km = distanceKm(lat, lng, coords.lat, coords.lng);
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  return bestKm <= MAX_MATCH_KM ? best : null;
}

// Lit la position (permission demandée au passage) et renvoie la ville
// détectée. null dans TOUS les cas d'incertitude : permission refusée, module
// indisponible (web), délai dépassé, position loin de toute ville connue.
// La vérification est une aide, jamais un mur.
export async function detectCity(cities: City[]): Promise<City | null> {
  try {
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (!pos) return null;
    return nearestCity(cities, pos.coords.latitude, pos.coords.longitude);
  } catch {
    return null;
  }
}
