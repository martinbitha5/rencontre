import type { z } from "zod";
import type { ecranSchema } from "./Ecran";

// Les huit captures de la fiche Play Store, dans l'ordre d'affichage. Les
// deux premières sont celles que la plupart des gens voient sans faire
// défiler : elles portent la promesse et le geste principal.
export const ECRANS: z.infer<typeof ecranSchema>[] = [
  {
    capture: "01-rencontres.png",
    etiquette: "RENCONTRES",
    titre: "Des Congolais qui cherchent la même chose que toi",
    accent: "la même chose",
    fond: "flamme",
  },
  {
    capture: "02-fiche.png",
    etiquette: "PROFILS",
    titre: "Découvre la personne avant de liker",
    accent: "la personne",
    fond: "clair",
  },
  {
    capture: "04-likes.png",
    etiquette: "LIKES",
    titre: "Vois qui a craqué pour toi",
    accent: "craqué",
    fond: "sombre",
  },
  {
    capture: "06-chat.png",
    etiquette: "DISCUSSIONS",
    titre: "Discute en toute confiance",
    accent: "confiance",
    fond: "flamme",
  },
  {
    capture: "03-dm.png",
    etiquette: "MESSAGE DIRECT",
    titre: "Ose écrire le premier mot",
    accent: "premier mot",
    fond: "clair",
  },
  {
    capture: "08-intention.png",
    etiquette: "INTENTIONS",
    titre: "Dis clairement ce que tu cherches",
    accent: "clairement",
    fond: "sombre",
  },
  {
    capture: "07-profil.png",
    etiquette: "TON PROFIL",
    titre: "Un profil vérifié qui te ressemble",
    accent: "vérifié",
    fond: "flamme",
  },
  {
    capture: "09-confidentialite.png",
    etiquette: "CONFIDENTIALITÉ",
    titre: "Ta vie privée, tes règles",
    accent: "tes règles",
    fond: "clair",
  },
];
