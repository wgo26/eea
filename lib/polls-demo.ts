/**
 * Curated polls shown on the Community News page *before* the database
 * migration (`supabase/migrations/20260902000000_community_polls.sql`) is
 * applied.
 *
 * `lib/queries/polls.ts` prefers real rows and only falls back to this list
 * when the tables are not present, so the module never breaks the page. Once
 * the migration runs, these stop being used and votes persist properly.
 *
 * The tallies here are illustrative starting points, not recorded ballots —
 * hence the "indicative, not a scientific survey" note rendered under every
 * poll.
 */
export type DemoPoll = {
    id: string;
    question: string;
    closesInDays: number | null;
    options: { id: string; label: string; votes: number }[];
};

export const DEMO_POLLS: DemoPoll[] = [
    {
        id: "demo-mankon-market",
        question:
            "Mankon market traders have one repair budget this year. Where should it go?",
        closesInDays: 14,
        options: [
            { id: "demo-mankon-1", label: "Fix the drainage channels", votes: 148 },
            { id: "demo-mankon-2", label: "Rebuild the meat section roof", votes: 96 },
            { id: "demo-mankon-3", label: "Resurface the access road", votes: 212 },
            { id: "demo-mankon-4", label: "More lighting and security", votes: 61 },
        ],
    },
    {
        id: "demo-rainy-season",
        question: "How ready is your neighbourhood for the rainy season?",
        closesInDays: 7,
        options: [
            { id: "demo-rain-1", label: "Ready — drains have been cleared", votes: 74 },
            { id: "demo-rain-2", label: "Partly — some streets still flood", votes: 189 },
            { id: "demo-rain-3", label: "Not ready at all", votes: 133 },
        ],
    },
    {
        id: "demo-cover-next",
        question: "What should Eagle Eye investigate next in Bamenda?",
        closesInDays: 30,
        options: [
            { id: "demo-cover-1", label: "Water supply interruptions", votes: 231 },
            { id: "demo-cover-2", label: "The cost of school materials", votes: 88 },
            { id: "demo-cover-3", label: "Waste collection gaps", votes: 117 },
            { id: "demo-cover-4", label: "Transport fares", votes: 54 },
        ],
    },
];
