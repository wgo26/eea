/**
 * Translation quality guard (pure, client-safe: no secrets, no network).
 *
 * Every machine-translation write path runs its output through here before it
 * reaches a form or the database. The bug it prevents: DeepL (or a copy
 * button) returning English text that lands in the French locale — silent,
 * publishable, and indistinguishable from a real translation by the CMS.
 *
 * Detection is deliberately conservative: short strings ("Market fire", "3
 * questions") carry too few signals, so they return null (unknown) rather
 * than a guess. The unchanged-text check is exact after normalization, which
 * is what catches the literal "Copy English → French" outcome.
 */

export type Lang = 'en' | 'fr'

const EN = new Set(
  'a,an,and,or,but,if,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,it,its,this,that,these,those,we,you,they,he,she,our,your,their,his,her,not,do,does,did,have,has,had,will,would,can,could,should,into,out,over,under,when,where,why,how,all,any,more,most,other,some,such,only,same,than,too,very,about,after,before,between,during,through,while,because,until,say,said,says,people,make,made,time,new,years,day,world,country,according,says,then,there,here,since,against,among,within,without,each,every,what,which,who,whose,how,many,much,like,just,also,still,already,ever,never'.split(
    ',',
  ),
)

const FR = new Set(
  'le,la,les,un,une,des,du,au,aux,et,ou,mais,donc,car,que,qui,dont,quand,comment,pourquoi,ne,pas,plus,moins,tres,aussi,encore,deja,sous,dans,pour,par,avec,sans,chez,entre,vers,avant,apres,pendant,lors,etre,avoir,est,sont,etait,etaient,ont,fait,vont,dire,nous,vous,ils,elles,son,sa,ses,notre,vos,leur,leurs,ce,cet,cette,ces,tout,tous,toute,toutes,chaque,autre,autres,meme,oui,non,parce,plusieurs,selon,entre,vers,en,afin,tandis,peut,peuvent,doit,doivent,people,gens,monde,pays,annee,annees,jour,fait,dit,dite,nouvelle,annonce,communique'.split(
    ',',
  ),
)

const ACCENTS_RE = /[àâæçéèêëîïôœùûü]/gi
const ELISION_RE = /['’](?:l|d|j|n|t|s|c|m|qu|q)[aeiçouy]/gi

/** HTML → plain text (tags and entities drop out, words survive). */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
}

function normalize(text: string): string {
  return stripTags(text)
    .toLowerCase()
    .replace(/[\s.,;:!?"'’‘()\-–—«»…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * True when two strings are the same editorial text once case, punctuation
 * and markup are stripped (min length 8 so short names don't collide).
 */
export function textEquals(a: string, b: string): boolean {
  const x = normalize(a)
  const y = normalize(b)
  return x.length >= 8 && x === y
}

/**
 * Which language this text is in, when the evidence is strong.
 * `null` = too short / too balanced to say (callers must not treat unknown
 * as English or French).
 */
export function dominantLang(text: string, minChars = 30): Lang | null {
  const plain = stripTags(text)
  if (plain.trim().length < minChars) return null
  let en = 0
  let fr = 0
  for (const t of plain.toLowerCase().match(/[\p{L}]+/gu) ?? []) {
    // 'a' doubles as the English article and the French verb avoir; it is a
    // weak signal either way, so it counts for the language it shares with
    // its neighbours rather than skewing short strings.
    if (FR.has(t)) fr++
    if (EN.has(t)) en++
  }
  fr += (plain.match(ELISION_RE)?.length ?? 0) * 2
  fr += Math.min(plain.match(ACCENTS_RE)?.length ?? 0, 4)
  const total = en + fr
  if (total === 0) return null
  const ratio = (fr - en) / total
  if (Math.abs(ratio) < 0.35) return null
  return ratio > 0 ? 'fr' : 'en'
}

export type QcStatus = 'ok' | 'empty' | 'unchanged' | 'wrong_language'

/**
 * One translated field's verdict. `empty` is not a failure — the caller may
 * legitimately have had no source text for that field. An empty `source`
 * skips only the unchanged-text check; the language check still runs (used
 * by share-line drafting, which has no source pair).
 */
export function qcField(source: string, output: string, target: Lang): QcStatus {
  if (!output.trim()) return 'empty'
  if (source.trim() && textEquals(source, output)) return 'unchanged'
  const lang = dominantLang(output)
  if (lang && lang !== target) return 'wrong_language'
  return 'ok'
}
