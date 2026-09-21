import { readFileSync, writeFileSync } from 'fs';

const content = readFileSync('C:\\Users\\Fame\\apps\\eea\\lib\\i18n\\fr.ts', 'utf8');
const newContent = content.replace(
  "browseOtherPlaces: 'Parcourir d\u2019autres lieux',\n  },\n  search: {",
  "browseOtherPlaces: 'Parcourir d\u2019autres lieux',\n    yourPlace: 'Votre lieu',\n    selectPlace: 'Choisir votre lieu',\n    searchPlaces: 'Rechercher des lieux...',\n    noPlacesFound: 'Aucun lieu trouve.',\n    clearPlace: 'Effacer le lieu',\n    nearYou: 'Pres de chez vous',\n    nearYouTitle: 'Dernieres actualites de {place}',\n  },\n  search: {"
);
writeFileSync('C:\\Users\\Fame\\apps\\eea\\lib\\i18n\\fr.ts', newContent);
console.log('Done');