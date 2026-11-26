// Les filtres de recherche vivent au niveau racine, au-dessus des onglets :
// on y entre depuis Rencontres comme depuis Paramètres, et le retour ramène
// toujours là d'où l'on vient. Logés dans la pile de l'onglet Profil, ils y
// restaient empilés : ouvrir Profil plus tard retombait sur les filtres.
export { default } from '@/screens/SearchPreferences/SearchPreferences';
