/**
 * Pack: ed-demo-content — the core editorial roster.
 *
 * Migrates the demo content from scripts/seed-demo.mjs and
 * scripts/seed-fundraisers.mjs into the preset system so it is
 * teardown-exact and dependency-declared. All content is tied to the
 * seeded locations and categories, which is why `deps` pulls tax-*.
 *
 * Content types covered: photo_story, news, notice, listing, culture,
 * plus the fundraiser extension rows and community polls.
 *
 * Audience: staging — this is clearly demo content with demo photographer
 * credits, not real editorial. Safe for local by default.
 */

const daysAgo = (n) => `now() - interval '${n} days'`;

const PHOTO_STORIES = [
    {
        slug: "dawn-at-mankon-market",
        loc: "mankon",
        cat: "everyday-africa",
        verification: "verified",
        featured: true,
        days: 1,
        media: ["mankon-dawn", "mankon-dawn-2"],
        credit: "Sarah N.",
        en: {
            title: "Dawn at Mankon Market: The City Wakes in Colour",
            excerpt: "Before the first troley rolls into Bamenda, Mankon market is already alive — traders, tea steam and sunrise all competing for attention.",
            body: "At 5:40 AM the stalls are half-built and the bargaining has already begun.",
            share: "The market at dawn — when the city is still half-asleep but the trading never stops.",
            seo: "Mankon Market at dawn, Bamenda — early morning photography of traders and sunrise",
        },
        fr: {
            title: "L'aube au marché Mankon : la ville s'éveille en couleurs",
            excerpt: "Avant le premier troley à Bamenda, le marché Mankon vit déjà — commerçants, vapeur de thé et lever de soleil.",
            body: "À 5 h 40, les étals sont à moitié montés et le marchandage a déjà commencé.",
            share: "Le marché à l'aube — quand la ville est encore à moitié endormie, mais le commerce ne s'arrête jamais.",
            seo: "Marché Mankon à l'aube, Bamenda — photographie matinal du commerce et du soleil levant",
        },
    },
    {
        slug: "new-nkwen-footbridge",
        loc: "nkwen",
        cat: "infrastructure",
        verification: "official_source",
        days: 2,
        media: ["nkwen-bridge"],
        credit: "Eyong B.",
        en: {
            title: "The New Nkwen Footbridge, Through Neighbours' Eyes",
            excerpt: "Residents photographed the first week of the footbridge that finally links the two sides of the stream during rainy season.",
            body: "For eleven years the crossing disappeared every rainy season.",
            share: "A new footbridge in Nkwen, built after eleven years of seasonal floods — told through residents' lenses.",
            seo: "Nkwen footbridge opening, Bamenda — residents photograph the new crossing",
        },
        fr: {
            title: "La nouvelle passerelle de Nkwen, vue par les riverains",
            excerpt: "Les habitants ont photographié la première semaine de la passerelle qui relie enfin les deux rives.",
            body: "Pendant onze ans, la traversée disparaissait à chaque saison des pluies.",
            share: "Une nouvelle passerelle à Nkwen, construite après onze ans d'inondations saisonnières.",
            seo: "Inauguration de la passerelle de Nkwen, Bamenda — les riverains témoignent",
        },
    },
    {
        slug: "sunday-choir-bafut",
        loc: "bafut",
        cat: "culture",
        verification: "community_submission",
        days: 4,
        media: ["bafut-choir"],
        credit: "Mireille T.",
        en: {
            title: "Sunday Morning with the Bafut Youth Choir",
            excerpt: "One service, three languages, and a choir that keeps growing every month.",
            body: "The drums start before the sermon ends.",
            share: "In Bafut, Sunday morning means drums, three languages, and a youth choir that keeps growing.",
            seo: "Bafut youth choir, Sunday service — community worship photography",
        },
        fr: {
            title: "Dimanche matin avec la chorale de jeunes de Bafut",
            excerpt: "Une messe, trois langues et une chorale qui grandit chaque mois.",
            body: "Les tambours commencent avant la fin du sermon.",
            share: "À Bafut, le dimanche matin signifie des tambours, trois langues et une chorale de jeunesse.",
            seo: "Chorale de jeunes de Bafut, dimanche — culte communautaire en photos",
        },
    },
    {
        slug: "motorcycle-taxi-nights-bamenda",
        loc: "bamenda",
        cat: "people",
        verification: "community_submission",
        days: 6,
        media: ["bda-moto"],
        credit: "Kiven D.",
        en: {
            title: "Night Shift: Portrait of a Bamenda Motorcycle Taxi",
            excerpt: "Twelve hours, two fuel stops, one headlight — the city after dark, seen from the back of a bike.",
            body: "When the offices close, the second city opens.",
            share: "Twelve hours on a motorcycle taxi through Bamenda after dark — a different city emerges.",
            seo: "Bamenda motorcycle taxi night shift — urban mobility photography",
        },
        fr: {
            title: "De nuit : portrait d'un taxi-moto de Bamenda",
            excerpt: "Douze heures, deux pleins, un phare — la ville après le coucher du soleil, vue de l'arrière d'une moto.",
            body: "Quand les bureaux ferment, la deuxième ville s'ouvre.",
            share: "Douze heures en taxi-moto à travers Bamenda après le coucher du soleil.",
            seo: "Taxi-moto de nuit à Bamenda — photographie de mobilité urbaine",
        },
    },
    {
        slug: "mankon-rainy-season-flood",
        loc: "mankon",
        cat: "environment",
        verification: "verified",
        days: 3,
        media: ["mankon-flood"],
        credit: "Sarah N.",
        en: {
            title: "When the Rains Come: Mankon Market After the Flood",
            excerpt: "The drainage channels overflowed at 6 AM on Tuesday — five stalls were underwater for forty minutes.",
            body: "The market reopened at 8 AM, but vendors say this happens every rainy season.",
            share: "Mankon Market floods again — but vendors reopen within hours, as they have every rainy season.",
            seo: "Mankon market flood, Bamenda rainy season — drainage overflow photography",
        },
        fr: {
            title: "Quand les pluies arrivent : le marché Mankon après l'inondation",
            excerpt: "Les canaux de drainage ont débordé à 6 heures mardi — cinq étals étaient sous l'eau pendant quarante minutes.",
            body: "Le marché a rouvert à 8 heures, mais les vendeurs disent que ça arrive chaque saison des pluies.",
            share: "Le marché Mankon inonde à nouveau, mais les vendeurs rouvrent quelques heures plus tard.",
            seo: "Inondation du marché Mankon, saison des pluies à Bamenda",
        },
    },
];

const NEWS = [
    {
        slug: "commercial-avenue-reopens",
        loc: "bamenda",
        cat: "infrastructure",
        verification: "official_source",
        featured: true,
        days: 1,
        en: {
            title: "Commercial Avenue Reopens After Three Weeks of Road Works",
            excerpt: "The stretch between the market roundabout and CRS junction reopened to traffic Monday morning after drainage upgrades.",
            body: "Drivers reported free-flowing traffic from 6 AM Monday. The city council said the works were necessary to prevent seasonal flooding.",
            share: "Commercial Avenue is open again after three weeks of drainage work — traffic flowing from 6 AM.",
            seo: "Commercial Avenue Bamenda reopens after road works — drainage upgrade complete",
        },
        fr: {
            title: "L'avenue Commerciale rouvre après trois semaines de travaux",
            excerpt: "Le tronçon entre le rond-point du marché et le carrefour CRS a rouvert lundi après des travaux de drainage.",
            body: "Dès 6 h lundi, la circulation était fluide. La mairie a déclaré que les travaux étaient nécessaires pour éviter les inondations saisonnières.",
            share: "L'avenue Commerciale rouvre après trois semaines de travaux de drainage.",
            seo: "Réouverture de l'avenue Commerciale à Bamenda après travaux de drainage",
        },
    },
    {
        slug: "city-council-water-points",
        loc: "nkwen",
        cat: "community",
        verification: "verified",
        days: 2,
        en: {
            title: "City Council Confirms Twelve New Public Water Points",
            excerpt: "Locations announced for Nkwen and Mankon as the dry-season plan begins.",
            body: "The council published the full list on Tuesday, adding six points to the existing network of thirty-four. Each site will be maintained by the public works department.",
            share: "Twelve new public water points coming to Nkwen and Mankon — the dry-season plan starts now.",
            seo: "Bamenda City Council announces twelve new public water points for dry season",
        },
        fr: {
            title: "La mairie confirme douze nouveaux points d'eau publics",
            excerpt: "Les sites annoncés à Nkwen et Mankon alors que le plan de saison sèche démarre.",
            body: "La mairie a publié la liste complète mardi, ajoutant six points au réseau existant de trente-quatre. Chaque site sera entretenu par le service des travaux publics.",
            share: "Douze nouveaux points d'eau publique à Nkwen et Mankon — le plan de saison sèche commence.",
            seo: "La mairie de Bamenda annonce douze nouveaux points d'eau publique pour la saison sèche",
        },
    },
    {
        slug: "bilingual-school-quiz",
        loc: "bamenda",
        cat: "education",
        verification: "community_submission",
        days: 3,
        en: {
            title: "Forty Schools Compete in the Annual Bilingual Quiz",
            excerpt: "The inter-school finals return to the congress hall this Saturday, English and French divisions.",
            body: "Organisers say registration doubled this year, with 840 students across both divisions. Prizes include textbooks and tablets.",
            share: "Forty schools, 840 students — the bilingual quiz finals are this Saturday at the congress hall.",
            seo: "Annual bilingual quiz finals at Bamenda congress hall — 40 schools compete",
        },
        fr: {
            title: "Quarante écoles en lice pour le grand quiz bilingue",
            excerpt: "La finale inter-écoles revient au palais des congrès samedi, divisions anglaise et française.",
            body: "Les organisateurs annoncent un doublement des inscriptions cette année, avec 840 élèves dans les deux divisions. Les prix comprennent des manuels et des tablettes.",
            share: "Quarante écoles, 840 élèves — les finales du quiz bilingue sont samedi au palais des congrès.",
            seo: "Finales du quiz bilingue au palais des congrès de Bamenda — 40 écoles en compétition",
        },
    },
    {
        slug: "farmers-market-prices",
        loc: "bamenda",
        cat: "business",
        verification: "developing",
        days: 5,
        en: {
            title: "Tomato Prices Jump at Bamenda Food Market — Traders Explain",
            excerpt: "A bag that cost 18,000 FCFA last month now sells above 26,000. Transporters blame the rainy roads.",
            body: "Wholesalers pointed to two factors: transport costs doubled after the October floods, and a partial harvest failure in the west region. Prices are expected to normalise by December.",
            share: "Tomato prices jump from 18K to 26K FCFA per bag — floods and harvest failure behind the surge.",
            seo: "Tomato prices surge at Bamenda food market — 18K to 26K FCFA per bag",
        },
        fr: {
            title: "Le prix des tomates flambade au marché de Bamenda — explications",
            excerpt: "Un sac à 18 000 FCFA le mois dernier se vend au-dessus de 26 000. Les transporteurs invoquent les routes.",
            body: "Les grossistes pointent deux facteurs : les coûts de transport ont doublé après les inondations d'octobre, et une récolte partielle a échoué dans la région de l'Ouest. Les prix devraient redescendre en décembre.",
            share: "Les tomates passent de 18K à 26K FCFA le sac — inondations et récolte défaillante.",
            seo: "Flambée des prix des tomates au marché de Bamenda — 18K à 26K FCFA le sac",
        },
    },
];

const NOTICES = [
    {
        slug: "road-works-mankon-street",
        loc: "mankon",
        cat: "road-closure",
        noticeType: "road_closure",
        official: true,
        verification: "official_source",
        days: 0,
        expires: 9,
        org: "Bamenda City Council",
        en: {
            title: "Road Works on Mankon Main Street — Diversion Via Hospital Roundabout",
            excerpt: "Asphalt works from Thursday 6 AM to Saturday 6 PM. Market traffic diverted via Hospital Roundabout.",
            body: "Motorists should expect delays between 7 AM and 4 PM. The council apologises for the inconvenience.",
            share: "Road works on Mankon Main Street this weekend — use Hospital Roundabout as diversion.",
            seo: "Mankon Main Street road works — diversion via Hospital Roundabout, Bamenda",
        },
        fr: {
            title: "Travaux sur la rue principale de Mankon — dévia via le rond-point de l'Hôpital",
            excerpt: "Bitumage du jeudi 6 h au samedi 18 h. Circulation déviée par le rond-point de l'Hôpital.",
            body: "Prévoir des retards entre 7 h et 16 h. La mairie présente ses excuses pour la gêne.",
            share: "Travaux sur la rue principale de Mankon ce week-end — passez par le rond-point de l'Hôpital.",
            seo: "Travaux sur la rue Mankon — déviation via le rond-point de l'Hôpital, Bamenda",
        },
    },
    {
        slug: "lost-student-id-card",
        loc: "bamenda",
        cat: "lost-found",
        noticeType: "lost_found",
        verification: "community_submission",
        days: 1,
        expires: 20,
        en: {
            title: "Lost: Student ID Card Near Up Station Taxi Park",
            excerpt: "Blue cover, University of Bamenda, name starting with N. Finder please call — reward offered.",
            body: "Lost between the park and the pharmacy on Tuesday morning. If found, contact the campus security office.",
            share: "Lost: blue University of Bamenda ID card near Up Station Taxi Park. Reward offered.",
            seo: "Lost student ID card found near Up Station Taxi Park, Bamenda",
        },
        fr: {
            title: "Perdu : carte d'étudiant près du parking de Up Station",
            excerpt: "Couverture bleue, Université de Bamenda, nom commençant par N. Récompense offerte.",
            body: "Perdue entre le parking et la pharmacie mardi matin. Si trouvée, contacter le bureau de sécurité du campus.",
            share: "Perdu : carte d'étudiant bleue près du parking de Up Station. Récompense.",
            seo: "Carte d'étudiant perdue près du parking de Up Station, Bamenda",
        },
    },
    {
        slug: "malaria-prevention-drive",
        loc: "nkwen",
        cat: "community-alert",
        noticeType: "service_announcement",
        official: true,
        verification: "verified",
        days: 2,
        expires: 14,
        org: "District Health Service",
        en: {
            title: "Free Malaria Testing Week at Nkwen Health Centre",
            excerpt: "Testing and treated nets free of charge for children under five and pregnant women, all week.",
            body: "The centre opens 8 AM to 3 PM daily. This is part of the national prevention campaign running through October.",
            share: "Free malaria testing at Nkwen Health Centre this week — nets and tests for under-fives.",
            seo: "Free malaria testing week at Nkwen Health Centre, Bamenda",
        },
        fr: {
            title: "Semaine de dépistage gratuit du paludisme au centre de santé de Nkwen",
            excerpt: "Tests et moustiquaires imprégnées gratuits pour les moins de cinq ans et femmes enceintes.",
            body: "Le centre ouvre de 8 h à 15 h. Fait partie de la campagne nationale de prévention à travers octobre.",
            share: "Dépistage gratuit du paludisme au centre de santé de Nkwen cette semaine.",
            seo: "Semaine de dépistage gratuit du paludisme au centre de santé de Nkwen",
        },
    },
];

const LISTINGS = [
    {
        slug: "tecno-spark-10-for-sale",
        loc: "bamenda",
        cat: "electronics",
        price: 95000,
        days: 1,
        en: {
            title: "Tecno Spark 10 — 128GB, Clean Condition",
            excerpt: "Eight months old, screen protector since day one, charger included. Bamenda Commercial Avenue area pickup.",
            body: "Battery health is excellent, no scratches on the body. Original box and warranty card included.",
            share: "Tecno Spark 10 (128GB) for sale — clean condition, charger included. 95,000 FCFA.",
            seo: "Tecno Spark 10 128GB phone for sale in Bamenda — 95,000 FCFA",
        },
        fr: {
            title: "Tecno Spark 10 — 128 Go, très bon état",
            excerpt: "Huit mois, vitre de protection depuis le premier jour, chargeur inclus. À récupérer dans le secteur de l'Avenue Commerciale.",
            body: "Batterie en excellent état, aucune rayure sur le corps. Boîte d'origine et carte de garantie inclus.",
            share: "Tecno Spark 10 (128 Go) à vendre — très bon état, chargeur inclus. 95 000 FCFA.",
            seo: "Tecno Spark 10 128 Go à vendre à Bamenda — 95 000 FCFA",
        },
    },
    {
        slug: "toyota-corolla-2008",
        loc: "douala",
        cat: "vehicles",
        price: 3200000,
        days: 2,
        en: {
            title: "Toyota Corolla 2008 — First Hand, Papers Complete",
            excerpt: "Grey, petrol, 4 new tyres, AC working. Serious buyers only, inspection in Bonabéri.",
            body: "Mileage at 168,000 km. Recently serviced. Four new tyres installed last month. Full service history available.",
            share: "Toyota Corolla 2008 (grey, 168K km) — first hand, papers complete. 3.2M FCFA.",
            seo: "Toyota Corolla 2008 for sale in Douala — 3.2 million FCFA",
        },
        fr: {
            title: "Toyota Corolla 2008 — première main, papiers complets",
            excerpt: "Gris, essence, 4 pneus neufs, clim OK. Visite à Bonabéri, acheteurs sérieux uniquement.",
            body: "Compteur à 168 000 km. Récemment révisée. Quatre pneus neufs installés le mois dernier. Historique complet.",
            share: "Toyota Corolla 2008 (gris, 168K km) — première main, papiers complets. 3,2M FCFA.",
            seo: "Toyota Corolla 2008 à vendre à Douala — 3,2 millions de FCFA",
        },
    },
    {
        slug: "two-bedroom-flat-nkwen",
        loc: "nkwen",
        cat: "property",
        price: 45000,
        days: 3,
        en: {
            title: "2-Bedroom Flat for Rent — Nkwen, Water & Power Included",
            excerpt: "Ground floor, tiled, private bathroom, 10 minutes from the motor park. One year advance.",
            body: "The compound has a borehole. Security guard on site. Available from next week.",
            share: "2-bedroom flat for rent in Nkwen — water and power included. 45,000 FCFA/month.",
            seo: "2-bedroom flat for rent in Nkwen, Bamenda — 45,000 FCFA per month",
        },
        fr: {
            title: "Appartement 2 chambres à louer — Nkwen, eau et électricité incluses",
            excerpt: "Rez-de-chaussée, carrelé, douche interne, à 10 minutes du motor park. Une année d'avance.",
            body: "La cour a un forage. Gardien de sécurité sur place. Disponible à partir de la semaine prochaine.",
            share: "Appartement 2 chambres à louer à Nkwen — eau et électricité incluses. 45 000 FCFA/mois.",
            seo: "Appartement 2 chambres à louer à Nkwen, Bamenda — 45 000 FCFA le mois",
        },
    },
];

const CULTURE = [
    {
        slug: "ngoma-festival-lineup",
        loc: "bamenda",
        cat: "events",
        verification: "official_source",
        featured: true,
        days: 2,
        en: {
            title: "Ngoma Festival Announces Full Lineup for December Edition",
            excerpt: "Three days, two stages, and a diaspora showcase at the Bamenda congress hall.",
            body: "Organisers revealed the 24-artist lineup on Tuesday, including five diaspora acts returning for the first time since 2023.",
            share: "Ngoma Festival December lineup drops — 24 artists, two stages, diaspora showcase. Bamenda congress hall.",
            seo: "Ngoma Festival December edition lineup — 24 artists at Bamenda congress hall",
        },
        fr: {
            title: "Le festival Ngoma dévoile la programmation de décembre",
            excerpt: "Trois jours, deux scènes et une vitrine diaspora au palais des congrès de Bamenda.",
            body: "Les organisateurs ont révélé la programmation de 24 artistes mardi, dont cinq groupes diaspora pour la première fois depuis 2023.",
            share: "Programme du festival Ngoma pour décembre — 24 artistes, deux scènes, vitrine diaspora.",
            seo: "Programme du festival Ngoma décembre — 24 artistes au palais des congrès de Bamenda",
        },
    },
    {
        slug: "acheke-food-review",
        loc: "mankon",
        cat: "food",
        verification: "community_submission",
        days: 4,
        en: {
            title: "The Best Achu & Pepe Soup Corner in Mankon? We Tested Three",
            excerpt: "One wins on spice, one on price, one on the meat. A completely unofficial investigation.",
            body: "We started at 11 AM and finished at 3 PM. Verdict below — no one got paid to say what they did.",
            share: "We tested three achu & pepe soup spots in Mankon — one wins on spice, one on price, one on meat.",
            seo: "Best achu and pepe soup in Mankon — three spots taste-tested",
        },
        fr: {
            title: "Le meilleur coin achu et soupe pepe de Mankon ? Test de trois adresses",
            excerpt: "L'un gagne sur le piment, l'autre sur le prix, le troisième sur la viande. Enquête officieuse.",
            body: "Nous avons commencé à 11 h et fini à 15 h. Le verdict ci-dessous — personne n'a été payé.",
            share: "Nous avons testé trois adresses d'achu et soupe pepe à Mankon.",
            seo: "Meilleur achu et soupe pepe à Mankon — trois adresses testées",
        },
    },
];

const FUNDRAISERS = [
    {
        slug: "fundraiser-mankon-market-drainage",
        loc: "mankon",
        cat: "infrastructure",
        verification: "verified",
        days: 3,
        goal: 2_500_000,
        raised: 1_640_000,
        org: "Mankon Market Traders Association",
        phone: "+237 6 77 12 45 90",
        url: "https://example.org/give/mankon-drainage",
        notes: "Organizer identity and trader committee confirmed by the Eagle Eye editorial team on 30 August 2026.",
        en: {
            title: "Mankon Market Traders Raise Funds to Rebuild the Drainage Channels",
            excerpt: "Every rainy season the lower stalls flood before noon. The traders association has costed the repairs and started a campaign.",
            body: "The drainage channels along the lower row of Mankon market were last rebuilt in 2009. Since 2022 they have overflowed in every rainy season. An engineer's estimate put the repair at 2.5 million FCFA.",
            share: "Mankon market traders need 1.86M FCFA more to rebuild drainage channels — 1.64M already raised.",
            seo: "Mankon Market drainage rebuild fundraiser — community campaign for flood prevention",
        },
        fr: {
            title: "Les commerçants du marché Mankon collectent pour reconstruire les canalisations",
            excerpt: "À chaque saison des pluies, les étals du bas sont inondés avant midi. L'association a chiffré les réparations.",
            body: "Les canalisations du bas du marché Mankon n'ont pas été refaites depuis 2009. Depuis 2022, elles débordent à chaque saison. Un devis d'ingénieur a estimé la réparation à 2,5 millions de FCFA.",
            share: "Les commerçants du marché Mankon ont besoin de 1,86M FCFA de plus pour reconstruire.",
            seo: "Collecte de fonds pour la reconstruction des canalisations du marché Mankon",
        },
    },
    {
        slug: "fundraiser-nkwen-baby-emergency",
        loc: "nkwen",
        cat: "community",
        verification: "verified",
        days: 1,
        goal: 850_000,
        raised: 712_500,
        org: "Nkwen Neighbourhood Health Committee",
        phone: "+237 6 74 08 33 12",
        url: "https://example.org/give/nkwen-emergency",
        notes: "Hospital admission record and committee officers verified by two separate Eagle Eye editors.",
        en: {
            title: "Emergency Surgery Fund for a Three-Week-Old in Nkwen",
            excerpt: "The family cannot cover the referral and surgery costs alone. The neighbourhood health committee opened a campaign on Sunday evening.",
            body: "A three-week-old girl was referred from the Nkwen health centre to the regional hospital on Sunday with an intestinal obstruction requiring immediate surgery.",
            share: "Emergency surgery fund for a 3-week-old in Nkwen — 712K of 850K FCFA raised so far.",
            seo: "Emergency surgery fund for infant in Nkwen — community health campaign",
        },
        fr: {
            title: "Caisse d'urgence pour une opération d'un bébé de trois semaines à Nkwen",
            excerpt: "La famille ne peut pas couvrir seule les frais d'évacuation et d'opération.",
            body: "Une fillette de trois semaines a été évacuée du centre de santé de Nkwen vers l'hôpital régional dimanche.",
            share: "Caisse d'urgence pour une opération d'un bébé de trois semaines à Nkwen — 712K sur 850K FCFA.",
            seo: "Collecte urgence opération bébé à Nkwen — campagne de santé communautaire",
        },
    },
];

const POLLS = [
    {
        slug: "mankon-market-priority",
        loc: "mankon",
        question: "Which drainage improvement should the market traders prioritise?",
        questionFr: "Quelle amélioration des canalisations les commerçants du marché devraient-ils prioriser ?",
        days: 0,
        closesIn: 5,
        options: [
            { label: "Clear the main culvert under Commercial Avenue", labelFr: "Dégager le regard principal sous l'Avenue Commerciale" },
            { label: "Rebuild the channel along the lower stalls", labelFr: "Rebâtir le canal le long des étals du bas" },
            { label: "Install proper storm drains at the market entrance", labelFr: "Installer des regards d'égout à l'entrée du marché" },
            { label: "None of the above", labelFr: "Aucune de ces propositions" },
        ],
    },
    {
        slug: "rainy-season-readiness",
        loc: "bamenda",
        question: "Are you prepared for this rainy season's flooding?",
        questionFr: "Êtes-vous préparé(e) aux inondations de cette saison des pluies ?",
        days: 2,
        closesIn: 7,
        options: [
            { label: "Yes, my property is protected", labelFr: "Oui, ma propriété est protégée" },
            { label: "Partially — sandbags are ready but not full coverage", labelFr: "Partiellement — les sacs de sable sont prêts mais pas complets" },
            { label: "No, I am not prepared", labelFr: "Non, je ne suis pas préparé(e)" },
            { label: "I have no property at flood risk", labelFr: "Je n'ai pas de propriété à risque d'inondation" },
        ],
    },
    {
        slug: "what-to-cover-next",
        loc: "bamenda",
        question: "What should Eagle Eye Africa cover next?",
        questionFr: "Que devrait couvrir Eagle Eye Africa ensuite ?",
        days: 1,
        closesIn: 10,
        options: [
            { label: "The new school feeding programme rollout", labelFr: "Le déploiement du programme de repas scolaires" },
            { label: "Bamenda-Douala highway construction progress", labelFr: "L'avancement des travaux de l'autoroute Bamenda-Douala" },
            { label: "Impact of mobile money on local markets", labelFr: "L'impact de l'argent mobile sur les marchés locaux" },
            { label: "Climate adaptation in the Grassfields", labelFr: "L'adaptation au climat dans les Grassfields" },
        ],
    },
];

const MEDIA_SEED = (slug, i) => `https://picsum.photos/seed/${slug}/${1200}/${800}`;

export default {
    id: "ed-demo-content",
    family: "editorial",
    tier: 0,
    audience: "staging",
    title: "Demo editorial content",
    titleFr: "Contenu éditorial de démonstration",
    what: "Published content across every type (photo stories, news, notices, listings, culture, fundraisers) plus community polls, all tied to seeded taxonomy and locations so every public section renders. EN + FR translations, cover images, share/SEO drafts.",
    tables: [
        "content_items", "content_translations", "media_assets",
        "content_tags", "notices", "listings", "fundraisers",
        "polls", "poll_options",
    ],
    deps: ["tax-locations", "tax-categories", "tax-tags"],
    async rows(ctx) {
        await ctx.load("content_items");
        await ctx.load("categories");
        await ctx.load("locations");
        await ctx.load("tags");
        await ctx.load("media_assets");

        const locId = (slug) => ctx.id("locations", slug);
        const catId = (type, slug) => ctx.id("categories", type, slug);
        const tagId = (slug) => ctx.id("tags", slug);

        const out = [];
        const slugToId = new Map();

        // ---- helper: write one content item + translation + media ----
        const item = (entry) => {
            const id = ctx.uuid(`content/${entry.slug}`);
            slugToId.set(entry.slug, id);

            out.push({
                table: "content_items",
                row: {
                    id,
                    type: entry.type,
                    slug: entry.slug,
                    status: "published",
                    verification: entry.verification ?? "verified",
                    location_id: entry.loc ? locId(entry.loc) : null,
                    category_id: entry.cat ? catId(entry.type, entry.cat) : null,
                    is_featured: entry.featured ?? false,
                    is_archived: false,
                    published_at: ctx.iso(-entry.days),
                    first_published_at: ctx.iso(-entry.days),
                    expires_at: entry.expires !== undefined ? ctx.iso(entry.expires) : null,
                },
                note: `${entry.type}/${entry.slug}`,
            });

            // EN + FR translations
            const en = entry.en;
            const fr = entry.fr;
            out.push({
                table: "content_translations", row: {
                    id: ctx.uuid(`content/${entry.slug}/en`),
                    content_item_id: id,
                    locale: "en", voice: "formal",
                    title: en.title, excerpt: en.excerpt, body: en.body,
                    social_share_text: en.share,
                    whatsapp_share_text: en.share,
                    seo_title: en.title, seo_description: en.seo,
                },
            });
            out.push({
                table: "content_translations", row: {
                    id: ctx.uuid(`content/${entry.slug}/fr`),
                    content_item_id: id,
                    locale: "fr", voice: "formal",
                    title: fr.title, excerpt: fr.excerpt, body: fr.body,
                    social_share_text: fr.share,
                    whatsapp_share_text: fr.share,
                    seo_title: fr.title, seo_description: fr.seo,
                },
            });

            // Media assets
            const media = entry.media ?? [];
            for (let i = 0; i < Math.max(media.length, 1); i++) {
                const seed = media[i] ?? `${entry.slug}-cover`;
                out.push({
                    table: "media_assets", row: {
                        id: ctx.uuid(`media/${entry.slug}/${i}`),
                        content_item_id: id,
                        kind: "image", provider: "r2", destination: "public_photo",
                        storage_key: `seed/${seed}.jpg`,
                        public_url: MEDIA_SEED(seed, i),
                        mime_type: "image/jpeg",
                        width: 1200, height: 800,
                        caption: en.excerpt, photographer_credit: entry.credit ?? "Eagle Eye Africa",
                        alt_text: en.title, sort_order: i, is_cover: i === 0,
                    },
                });
            }
        };

        // Tags on items
        const tagItem = (slug, tagSlug) => {
            const itemId = slugToId.get(slug);
            const tid = tagId(tagSlug);
            out.push({
                table: "content_tags", row: {
                    id: ctx.uuid(`tag/${slug}/${tagSlug}`),
                    content_item_id: itemId, tag_id: tid,
                }, note: `tag ${tagSlug} on ${slug}`,
            });
        };

        // ---- photo stories ----
        for (const entry of PHOTO_STORIES) item({ ...entry, type: "photo_story" });
        tagItem("dawn-at-mankon-market", "everyday-africa");
        tagItem("new-nkwen-footbridge", "infrastructure");
        tagItem("mankon-rainy-season-flood", "developing-story");

        // ---- news ----
        for (const entry of NEWS) item({ ...entry, type: "news" });
        tagItem("commercial-avenue-reopens", "infrastructure");
        tagItem("city-council-water-points", "water");
        tagItem("bilingual-school-quiz", "schools");
        tagItem("farmers-market-prices", "market-prices");

        // ---- notices ----
        for (const entry of NOTICES) {
            item({ ...entry, type: "notice", media: undefined });
            out.push({
                table: "notices", row: {
                    content_item_id: slugToId.get(entry.slug),
                    notice_type: entry.noticeType,
                    organization_name: entry.org ?? "Community member",
                    notice_date: ctx.iso(-entry.days),
                    expiry_date: ctx.iso(entry.expires),
                    is_official: entry.official ?? false,
                },
            });
        }

        // ---- listings ----
        for (const entry of LISTINGS) {
            item({ ...entry, type: "listing", media: undefined });
            out.push({
                table: "listings", row: {
                    content_item_id: slugToId.get(entry.slug),
                    price: entry.price, currency: "XAF",
                    listing_status: "active",
                },
            });
        }

        // ---- culture ----
        for (const entry of CULTURE) item({ ...entry, type: "culture" });
        tagItem("ngoma-festival-lineup", "festival");
        tagItem("ngoma-festival-lineup", "music");
        tagItem("acheke-food-review", "food");

        // ---- fundraisers ----
        for (const entry of FUNDRAISERS) {
            item({ ...entry, type: "news" });
            out.push({
                table: "fundraisers", row: {
                    content_item_id: slugToId.get(entry.slug),
                    goal_amount: entry.goal, currency: "XAF",
                    raised_amount: entry.raised,
                    organizer_name: entry.org,
                    organizer_phone: entry.phone,
                    donation_url: entry.url,
                    verification_notes: entry.notes,
                    closed_at: null,
                },
            });
        }

        // ---- community polls (EEA itself) ----
        for (const p of POLLS) {
            const id = ctx.uuid(`poll/${p.slug}`);
            slugToId.set(`poll:${p.slug}`, id);
            out.push({
                table: "polls", row: {
                    id, slug: p.slug, question: p.question, locale: "en",
                    content_item_id: p.contentSlug ? slugToId.get(p.contentSlug) : null,
                    location_id: p.loc ? locId(p.loc) : null,
                    is_active: true, closes_at: ctx.iso(p.closesIn),
                },
            });
            p.options.forEach((opt, i) => {
                out.push({
                    table: "poll_options", row: {
                        id: ctx.uuid(`poll/${p.slug}/opt/${i}`),
                        poll_id: id,
                        label: opt.label, sort_order: i,
                    },
                });
            });
        }

        return out;
    },
};

