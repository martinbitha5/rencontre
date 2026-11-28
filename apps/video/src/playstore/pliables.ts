import type { PliableProps } from "./Pliable";

// Captures « appareils pliables », dans l'ordre d'import dans la Play Console.
// Les trois premières sont celles que Google exige : déplié 1:1, déplié 4:3,
// écran externe plié 10:16.
export const PLIABLES: PliableProps[] = [
  {
    format: "carre",
    captures: ["01-rencontres.png", "02-fiche.png"],
    etiquette: "RENCONTRES",
    titre: "Des Congolais qui cherchent la même chose que toi",
    accent: "la même chose",
    fond: "flamme",
  },
  {
    format: "paysage",
    captures: ["05-messages.png", "06-chat.png"],
    etiquette: "DISCUSSIONS",
    titre: "Discute en toute confiance",
    accent: "confiance",
    fond: "clair",
  },
  {
    format: "externe",
    captures: ["03-dm.png"],
    etiquette: "MESSAGE DIRECT",
    titre: "Ose écrire le premier mot",
    accent: "premier mot",
    fond: "sombre",
  },
  {
    format: "paysage",
    captures: ["04-likes.png", "07-profil.png"],
    etiquette: "LIKES",
    titre: "Vois qui a craqué pour toi",
    accent: "craqué",
    fond: "sombre",
  },
  {
    format: "carre",
    captures: ["08-intention.png", "09-confidentialite.png"],
    etiquette: "TA VIE PRIVÉE",
    titre: "Dis ce que tu cherches, garde tes règles",
    accent: "tes règles",
    fond: "clair",
  },
  {
    format: "externe",
    captures: ["01-rencontres.png"],
    etiquette: "RENCONTRES",
    titre: "Des profils vérifiés près de chez toi",
    accent: "vérifiés",
    fond: "flamme",
  },
];
