import { loadFont } from "@remotion/google-fonts/Montserrat";

// Visuels de la fiche Play Store : la police du site (Montserrat), en graisses
// fortes pour les titres, comme les h1 et h2 de zola-rdc.com.
export const { fontFamily: montserrat } = loadFont("normal", {
  weights: ["600", "700", "800", "900"],
  subsets: ["latin", "latin-ext"],
});
