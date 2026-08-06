// Contact du support. Le numéro WhatsApp est le seul réglage à faire ici :
// format international sans « + » ni espaces (ex. 243812345678).
//
// Tant qu'il est vide, l'aide bascule sur la page de contact du site : la
// fonctionnalité reste utilisable, elle ne pointe simplement pas encore vers
// WhatsApp. Renseigner EXPO_PUBLIC_SUPPORT_WHATSAPP dans .env suffit à
// l'activer sans toucher au code.
export const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '';

export const SITE = 'https://dowe-eight.vercel.app';

// wa.me plutôt que le schéma whatsapp:// : si l'application n'est pas
// installée, le lien ouvre la page web au lieu d'échouer en silence.
export function supportUrl(message?: string): string {
  if (!SUPPORT_WHATSAPP) return `${SITE}/contact.html`;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${SUPPORT_WHATSAPP}${text}`;
}

export const SUPPORT_IS_WHATSAPP = SUPPORT_WHATSAPP.length > 0;
