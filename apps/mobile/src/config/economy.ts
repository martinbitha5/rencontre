// Économie de pièces de l'app.
//
// "pièce" est le nom d'affichage de la monnaie interne : simple solde en
// base de données, rechargeable, utilisable uniquement dans l'application.
// La source de vérité des coûts est la table economy_config côté serveur
// (les RPC la relisent à chaque opération) ; les valeurs ci-dessous ne
// servent que d'affichage par défaut tant que get_wallet() n'a pas répondu.

import type { PackIconId } from '@/components/brand';

export const COIN_NAME = 'pièce';
export const COIN_NAME_PLURAL = 'pièces';

// 20000 -> « 20 000 ». Groupage fait à la main : Intl n'est pas garanti sur
// Hermes selon la configuration du build.
export function formatCoins(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
// Montant en francs congolais, groupé de la même façon : « 12 000 CDF ».
// Sert aux prix qui ne passent pas par la boutique, l'entrée en soirée d'abord.
export function formatCdf(value: number): string {
  return `${formatCoins(value)} CDF`;
}

// Or : couleur de l'icône de pièces (composant CoinIcon dans components/coins)
// et des pastilles de coût. La monnaie interne est toujours or, jamais rose :
// c'est ce qui la distingue du reste de l'interface.
export const COIN_COLOR = '#D4AF37';
// Encre posée sur un fond or : assez sombre pour rester lisible dessus.
export const COIN_ON_GOLD = '#4A3708';

// Échelle de la pièce : un DM coûte 200 pièces, comme sur le marché local.
// Toute modification se fait dans economy_config côté serveur (migration 027),
// ces valeurs ne sont qu'un affichage par défaut.
export const ECONOMY_DEFAULTS = {
  like_back_cost: 400,
  dm_cost: 200,
  free_dm_quota: 5,
  incognito_cost: 0,
  // Filtres premium : débit à l'activation, désactiver est gratuit.
  filter_online_cost: 8000,
  filter_goals_cost: 8000,
  filter_dm_cost: 16000,
};

// Likes offerts par jour aux comptes NON vérifiés. Un compte vérifié like sans
// limite : la contrainte n'est pas une offre à vendre, c'est ce qui pousse à
// faire vérifier son profil, donc à réduire les faux profils. Ce n'est pas un
// coût en pièces, d'où sa place hors de ECONOMY_DEFAULTS. La valeur qui fait
// foi est côté serveur (economy_config.free_daily_likes, migration 033) ;
// celle-ci n'est qu'un repli tant que get_wallet() n'a pas répondu.
export const DEFAULT_DAILY_LIKES = 30;

// Packs affichés sur l'écran de recharge. Deux rails de paiement :
// - international : IAP des stores (RevenueCat, à brancher), prix en USD ;
// - local (RDC) : Mobile Money via MultiPay, prix en francs congolais.
// Les montants CDF sont indicatifs côté client : le montant réellement
// débité sera toujours celui calculé côté serveur (fonction multipay-checkout)
// — garder les deux tables synchronisées.
//
// Grille de prix : mêmes quantités que le concurrent local, à un
// prix inférieur d'environ 7 % sur chaque palier. À DM = 200 pièces, ça donne
// 1 125 / 887 / 683 / 443 CDF le DM contre 1 195 / 956 / 735 / 478 chez eux.
// Le prix par pièce reste dégressif (5,6 → 4,4 → 3,4 → 2,2 CDF) pour pousser
// vers les gros packs.
//
// Ces montants intègrent les 3 % que MultiPay prélève sur chaque transaction :
// ils sont calés pour qu'APRÈS commission il nous reste la grille d'origine
// (4 300 / 12 900 / 21 500 / 42 900 CDF). L'écart avec le concurrent passe donc de
// 10 % à ~7 % : c'est la commission qui est répercutée, pas une hausse de
// marge. Arrondi à la centaine SUPÉRIEURE — un montant Mobile Money doit
// rester saisissable, et arrondir vers le bas remangerait la commission.
// Noms des offres : une progression française qui se lit d'elle-même
// (on découvre, on prend de l'élan, on s'envole, on y reste), plutôt que
// l'échelle métaux-pierres utilisée par tout le monde. L'identifiant technique
// suit le nom commercial — il fait foi côté serveur et dans les webhooks, et
// un identifiant qui ne correspond plus à ce que voit le client est un piège à
// contresens le jour d'un rapprochement de paiements.
export interface CoinPack {
  id: string;
  name: string;
  icon: PackIconId;
  coins: number;
  price: string;
  priceCdfLabel: string;
  priceCdf: number;
  tag?: string;
  // Pièces périssables : elles expirent après N jours et sont dépensées en
  // premier. La durée fait foi côté serveur (economy_config.pack_prestige_days).
  validityDays?: number;
}

export const COIN_PACKS: CoinPack[] = [
  {
    id: 'decouverte',
    name: 'Découverte',
    icon: 'compass',
    coins: 800,
    price: '1,79 $',
    priceCdfLabel: '4 500 CDF',
    priceCdf: 4500,
  },
  {
    id: 'elan',
    name: 'Élan',
    icon: 'bolt',
    coins: 3000,
    price: '5,49 $',
    priceCdfLabel: '13 300 CDF',
    priceCdf: 13300,
    tag: 'Populaire',
  },
  {
    id: 'envol',
    name: 'Envol',
    icon: 'rocket',
    coins: 6500,
    price: '8,99 $',
    priceCdfLabel: '22 200 CDF',
    priceCdf: 22200,
    tag: 'Meilleure offre',
  },
  {
    id: 'prestige',
    name: 'Prestige',
    icon: 'crown',
    coins: 20000,
    price: '17,99 $',
    priceCdfLabel: '44 300 CDF',
    priceCdf: 44300,
    tag: 'Le plus avantageux',
    validityDays: 30,
  },
];

// Il n'existe plus de montant sur mesure. Il servait à compléter son solde
// juste avant une entrée en soirée ; depuis que l'entrée se paie directement
// en francs sur le portail web (migration 035), il n'a plus d'objet.

// Abonnement Incognito : le profil sort du fil Rencontres. Vendu au mois,
// pas en pièces — c'est un droit dans le temps, pas une consommation.
// Grille positionnée sous le concurrent local, comme les packs, et calée de la
// même façon pour absorber les 3 % de commission MultiPay (elle rend
// 107 500 / 172 000 / 279 000 CDF nets).
export interface IncognitoPlan {
  id: string;
  months: number;
  price: string;
  priceCdfLabel: string;
  priceCdf: number;
}

export const INCOGNITO_PLANS: IncognitoPlan[] = [
  { id: '3m', months: 3, price: '44,99 $', priceCdfLabel: '110 900 CDF', priceCdf: 110900 },
  { id: '6m', months: 6, price: '71,99 $', priceCdfLabel: '177 400 CDF', priceCdf: 177400 },
  { id: '12m', months: 12, price: '116,99 $', priceCdfLabel: '287 700 CDF', priceCdf: 287700 },
];

// Économie par rapport au tarif mensuel du plus court forfait. Calculée, pas
// écrite en dur : un badge « -25 % » ne peut donc jamais mentir.
export function planSavingPercent(plan: IncognitoPlan): number {
  const base = INCOGNITO_PLANS[0].priceCdf / INCOGNITO_PLANS[0].months;
  return Math.round((1 - plan.priceCdf / plan.months / base) * 100);
}

// Vue normalisée d'un achat : les écrans « moyens de paiement », « numéro »
// et « résumé » traitent indifféremment un pack de pièces et un abonnement.
export interface Purchase {
  kind: 'coins' | 'incognito';
  id: string;
  title: string;
  detail: string;
  price: string;
  priceCdfLabel: string;
  priceCdf: number;
  icon: PackIconId;
  validityDays?: number;
}

export function findPurchase(kind?: string, id?: string): Purchase {
  if (kind === 'incognito') {
    const plan = INCOGNITO_PLANS.find((p) => p.id === id) ?? INCOGNITO_PLANS[1];
    return {
      kind: 'incognito',
      id: plan.id,
      title: 'Mode Incognito',
      detail: `Abonnement ${plan.months} mois`,
      price: plan.price,
      priceCdfLabel: plan.priceCdfLabel,
      priceCdf: plan.priceCdf,
      icon: 'incognito',
    };
  }
  const pack = COIN_PACKS.find((p) => p.id === id) ?? COIN_PACKS[0];
  return {
    kind: 'coins',
    id: pack.id,
    title: `Pack ${pack.name}`,
    detail: `${formatCoins(pack.coins)} ${COIN_NAME_PLURAL}`,
    price: pack.price,
    priceCdfLabel: pack.priceCdfLabel,
    priceCdf: pack.priceCdf,
    icon: pack.icon,
    validityDays: pack.validityDays,
  };
}

// Opérateurs Mobile Money supportés en RDC (agrégés par MultiPay).
export const MOBILE_MONEY_OPERATORS = [
  { id: 'airtel', name: 'Airtel Money' },
  { id: 'orange', name: 'Orange Money' },
  { id: 'vodacom', name: 'M-Pesa (Vodacom)' },
] as const;
export type MobileMoneyOperator = (typeof MOBILE_MONEY_OPERATORS)[number]['id'];
