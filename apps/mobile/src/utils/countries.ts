import { useEffect, useState } from 'react';
import { getCities, getCityCountry } from '@/services/api';
import { useAuth } from '@/providers/auth';
import type { City, CountryCode } from '@/types';

// Les deux pays servis par Zola (migration 071). Chacun vit à part : on
// choisit son pays à l'inscription, on ne charge que ses villes, on ne voit
// que les gens de son pays.
export const COUNTRIES: Record<CountryCode, { name: string; short: string; flag: string }> = {
  CD: { name: 'République démocratique du Congo', short: 'RDC', flag: '🇨🇩' },
  CG: { name: 'République du Congo', short: 'Congo-Brazzaville', flag: '🇨🇬' },
};

export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];

export function countryName(code: CountryCode | null | undefined): string {
  return COUNTRIES[code ?? 'CD'].name;
}

// Mon pays, déduit de la ville de mon profil (une seule ligne lue, gardée en
// cache). null tant qu'il n'est pas connu.
export function useMyCountry(): CountryCode | null {
  const { profile } = useAuth();
  const cityId = profile?.city_id ?? null;
  const [country, setCountry] = useState<CountryCode | null>(null);
  useEffect(() => {
    if (cityId == null) return;
    let alive = true;
    getCityCountry(cityId)
      .then((c) => alive && setCountry(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cityId]);
  return country;
}

// Les villes d'un pays donné (l'autre Congo, dans les filtres). Rien n'est
// chargé tant que le pays est null.
export function useCitiesOf(country: CountryCode | null): City[] {
  const [cities, setCities] = useState<City[]>([]);
  useEffect(() => {
    if (!country) return;
    let alive = true;
    getCities(country)
      .then((c) => alive && setCities(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [country]);
  return cities;
}

// Les villes de mon pays, et seulement celles-là.
export function useMyCities(): { country: CountryCode | null; cities: City[] } {
  const country = useMyCountry();
  const [cities, setCities] = useState<City[]>([]);
  useEffect(() => {
    if (!country) return;
    let alive = true;
    getCities(country)
      .then((c) => alive && setCities(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [country]);
  return { country, cities };
}

// Pays d'une personne à partir du nom de sa ville (les fiches de profil ne
// reçoivent que le nom). Le fil ne montre que des gens de mon pays : on
// cherche donc le nom dans MES villes, sans jamais charger celles de l'autre
// pays. Un nom absent de ma liste ne peut venir que de l'autre pays (cas
// d'une soirée, par exemple).
export function useCountryOfCity(cityName: string | null | undefined): CountryCode {
  const { country, cities } = useMyCities();
  const mine = country ?? 'CD';
  if (!cityName || !cities.length) return mine;
  if (cities.some((c) => c.name === cityName)) return mine;
  return mine === 'CD' ? 'CG' : 'CD';
}
