import type { City, CountryCode } from '@/types';

// Vérification de la ville par la position réelle, à l'inscription. Depuis le
// 27/11/2026 elle est obligatoire : on ne choisit que parmi les villes proches
// de là où l'on est, et la ville est ensuite figée (migration 072). Le
// matching reste par ville, pas par GPS : la position n'est lue qu'à cette
// étape, jamais stockée ni envoyée au serveur de Zola. Pour connaître le pays, elle
// passe par le géocodage du système (Apple ou Google), comme dans toute app
// qui affiche une adresse.
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
  // RDC, grandes villes hors chefs-lieux (migration 071)
  Beni: { lat: 0.491, lng: 29.473 },
  Boma: { lat: -5.854, lng: 13.056 },
  Butembo: { lat: 0.141, lng: 29.291 },
  Kikwit: { lat: -5.041, lng: 18.816 },
  Kipushi: { lat: -11.76, lng: 27.25 },
  Likasi: { lat: -10.981, lng: 26.733 },
  'Mbanza-Ngungu': { lat: -5.25, lng: 14.86 },
  'Mwene-Ditu': { lat: -7.0, lng: 23.45 },
  Uvira: { lat: -3.395, lng: 29.138 },
  Zongo: { lat: 4.343, lng: 18.594 },
  // Congo-Brazzaville (migration 071)
  Brazzaville: { lat: -4.263, lng: 15.242 },
  Djambala: { lat: -2.544, lng: 14.753 },
  Dolisie: { lat: -4.199, lng: 12.666 },
  Ewo: { lat: -0.873, lng: 14.82 },
  Impfondo: { lat: 1.618, lng: 18.058 },
  Kinkala: { lat: -4.36, lng: 14.76 },
  Madingou: { lat: -4.154, lng: 13.55 },
  Mossendjo: { lat: -2.95, lng: 12.72 },
  Nkayi: { lat: -4.183, lng: 13.283 },
  Ouesso: { lat: 1.614, lng: 16.051 },
  Owando: { lat: -0.481, lng: 15.9 },
  Oyo: { lat: -1.163, lng: 15.97 },
  'Pointe-Noire': { lat: -4.778, lng: 11.863 },
  Sibiti: { lat: -3.681, lng: 13.35 },
};

// Une ville peut être choisie si elle est à moins de ce rayon de la position
// (Butembo et Beni, à 50 km l'une de l'autre, restent ouvertes à qui vit
// entre les deux). La ville la plus proche est toujours permise, même plus
// loin : quelqu'un en zone rurale se rattache à la grande ville de sa région.
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

// Villes que la position autorise, de la plus proche à la plus lointaine :
// la plus proche toujours, puis celles à moins de MAX_MATCH_KM.
export function citiesInReach(cities: City[], lat: number, lng: number): City[] {
  const ranked = cities
    .filter((c) => CITY_COORDS[c.name])
    .map((c) => {
      const p = CITY_COORDS[c.name];
      return { city: c, km: distanceKm(lat, lng, p.lat, p.lng) };
    })
    .sort((a, b) => a.km - b.km);
  return ranked.filter((r, i) => i === 0 || r.km <= MAX_MATCH_KM).map((r) => r.city);
}

// Résultat de la vérification de position à l'inscription. Elle est
// OBLIGATOIRE : sans position valide, l'étape de la ville ne se passe pas.
//   ok            : villes autorisées autour de la position, la plus proche en tête
//   denied        : permission refusée, on peut redemander
//   blocked       : permission refusée définitivement, il faut passer par les réglages
//   unavailable   : GPS éteint, délai dépassé, pays introuvable : réessayer
//   wrong_country : le téléphone est dans l'autre pays que celui choisi
//   outside       : le téléphone n'est ni en RDC ni au Congo-Brazzaville
export type PlaceStatus = 'ok' | 'denied' | 'blocked' | 'unavailable' | 'wrong_country' | 'outside';

export interface DetectedPlace {
  status: PlaceStatus;
  allowed: City[];
  // Pays où se trouve vraiment le téléphone, quand on le connaît.
  country: CountryCode | null;
}

const place = (status: PlaceStatus, country: CountryCode | null = null): DetectedPlace => ({
  status,
  allowed: [],
  country,
});

// Lit la position et la confronte au pays choisi (la liste reçue ne contient
// que ses villes). On ne peut pas dire « je suis à Kinshasa » depuis Goma :
// seules les villes proches de la position sont proposées.
export async function detectCity(cities: City[]): Promise<DetectedPlace> {
  try {
    const Location = await import('expo-location');
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return place(perm.canAskAgain ? 'denied' : 'blocked');

    // Position : d'abord la dernière connue du téléphone (immédiate, suffit
    // pour une ville), sinon une lecture fraîche, précise puis approximative.
    // Une seule lecture lente ne doit pas bloquer l'inscription.
    const timeout = <T,>(ms: number) => new Promise<T | null>((r) => setTimeout(() => r(null), ms));
    let pos = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 }).catch(() => null);
    if (!pos) {
      pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
        timeout<Awaited<ReturnType<typeof Location.getCurrentPositionAsync>>>(15000),
      ]);
    }
    if (!pos) {
      pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }).catch(() => null),
        timeout<Awaited<ReturnType<typeof Location.getCurrentPositionAsync>>>(10000),
      ]);
    }
    if (!pos) return place('unavailable');
    const { latitude, longitude } = pos.coords;

    // Pays : le géocodage du système d'abord. Il échoue parfois (Android sans
    // services Google, émulateur, réseau faible) : on déduit alors le pays de
    // la ville connue la plus proche, avec les coordonnées embarquées dans
    // l'app, sans réseau. Kinshasa et Brazzaville restent distinctes : c'est
    // le centre-ville le plus proche qui tranche.
    const raw = await Promise.race([
      Location.reverseGeocodeAsync({ latitude, longitude })
        .then((r) => r[0]?.isoCountryCode?.toUpperCase() ?? null)
        .catch(() => null),
      timeout<string>(6000),
    ]);
    const country: CountryCode | null =
      raw === 'CD' || raw === 'CG' ? raw : raw ? null : countryFromCoords(latitude, longitude);
    if (!country) return place('outside');

    const chosen = cities[0]?.country ?? null;
    if (chosen && country !== chosen) return place('wrong_country', country);
    const allowed = citiesInReach(cities, latitude, longitude);
    if (!allowed.length) return place('unavailable', country);
    return { status: 'ok', allowed, country };
  } catch {
    return place('unavailable');
  }
}

// Villes du Congo-Brazzaville parmi les coordonnées embarquées ; toutes les
// autres sont en RDC.
const CG_CITY_NAMES = new Set([
  'Brazzaville', 'Djambala', 'Dolisie', 'Ewo', 'Impfondo', 'Kinkala', 'Madingou',
  'Mossendjo', 'Nkayi', 'Ouesso', 'Owando', 'Oyo', 'Pointe-Noire', 'Sibiti',
]);

// Au-delà de cette distance de toute ville connue, on considère que la
// position n'est ni en RDC ni au Congo-Brazzaville.
const OUTSIDE_KM = 500;

// Pays déduit de la ville connue la plus proche (repli sans géocodage).
function countryFromCoords(lat: number, lng: number): CountryCode | null {
  let bestName: string | null = null;
  let bestKm = Infinity;
  for (const [name, p] of Object.entries(CITY_COORDS)) {
    const km = distanceKm(lat, lng, p.lat, p.lng);
    if (km < bestKm) {
      bestKm = km;
      bestName = name;
    }
  }
  if (!bestName || bestKm > OUTSIDE_KM) return null;
  return CG_CITY_NAMES.has(bestName) ? 'CG' : 'CD';
}
