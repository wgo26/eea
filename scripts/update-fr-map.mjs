import { readFileSync, writeFileSync } from 'fs';

const content = readFileSync('C:\\Users\\Fame\\apps\\eea\\lib\\i18n\\fr.ts', 'utf8');
const newContent = content.replace(
  "map: {\n    title: 'Carte communautaire',\n    listView: 'Vue liste',\n    mapView: 'Vue carte',\n    hubsCount: '{count} lieux',\n    noMapped: 'Aucun lieu cartographi\u00E9.',\n    openHub: 'Ouvrir le lieu',\n    tilesCredit: 'Donn\u00E9es cartographiques \u00A9 contributeurs OpenStreetMap',\n  },\n  status: {",
  "map: {\n    title: 'Carte communautaire',\n    listView: 'Vue liste',\n    mapView: 'Vue carte',\n    hubsCount: '{count} lieux',\n    noMapped: 'Aucun lieu cartographi\u00E9.',\n    openHub: 'Ouvrir le lieu',\n    tilesCredit: 'Donn\u00E9es cartographiques \u00A9 contributeurs OpenStreetMap',\n    heading: 'Explorer la carte',\n    description: 'D\u00E9couvrez les histoires, avis, \u00E9v\u00E9nements et annonces dans la r\u00E9gion.',\n    filters: 'Filtres',\n    allTypes: 'Tous les types',\n    locationFilter: 'Lieu',\n    legend: 'L\u00E9gende',\n    cluster: 'Groupe',\n  },\n  status: {"
);
writeFileSync('C:\\Users\\Fame\\apps\\eea\\lib\\i18n\\fr.ts', newContent);
console.log('Done');