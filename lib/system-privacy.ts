// ── System-owned Privacy content (Fanometrix-controlled) ─────────────────────
// The fan-facing Privacy UI shown inside the Creatives is Fanometrix system
// content, NOT Publisher-authored Survey content. It is therefore centrally owned
// here (mirroring lib/system-thankyou.ts) and is NEVER counted in Publisher
// language-completeness. It renders in the active delivery language when a
// centrally-approved translation exists, otherwise falls back to English.
//
// TWO layers:
//   1. The full Privacy POLICY page — already localised in locales/privacy/*.json
//      for 9 languages (English fallback) and served at /[lang]/privacy. The
//      "Read Full Privacy Policy" CTA routes there via privacyPolicyHref().
//   2. The short in-Creative overlay/modal STRINGS below. These currently have NO
//      approved translations (English only). Approved translations are added to
//      OVERRIDES — DO NOT machine-translate legal/privacy copy.

// Languages for which a localised Privacy POLICY page exists (see
// app/[lang]/privacy/page.tsx + locales/privacy/*.json). Others fall back to en.
export const PRIVACY_POLICY_LANGS = new Set(["en", "de", "fr", "es", "it", "pt", "sv", "zh", "hi"]);

/**
 * Resolve a delivery language to one with a localised Privacy Policy page.
 * Region subtags are normalised to their base language so a `zh-CN` delivery
 * routes to the existing localised `zh` policy page (not the English fallback);
 * likewise any future `pt-BR` → `pt`, etc. Falls back to English only when no
 * localised page exists for the base language.
 */
export function resolvePrivacyLang(lang: string | null | undefined): string {
  if (!lang) return "en";
  if (PRIVACY_POLICY_LANGS.has(lang)) return lang;
  const base = lang.split("-")[0];
  return PRIVACY_POLICY_LANGS.has(base) ? base : "en";
}

/** Destination of the "Read Full Privacy Policy" CTA in the active language. */
export function privacyPolicyHref(lang: string | null | undefined): string {
  return `/${resolvePrivacyLang(lang)}/privacy`;
}

export interface PrivacySlide {
  title: string;
  text: string | null;
  bullets: { text: string; highlight?: boolean }[] | null;
}

export interface SystemPrivacy {
  /** Header/label word ("Privacy"). */
  label: string;
  /** Close/return control ("Back"). */
  back: string;
  /** Countdown overlay heading. */
  anonymousHeading: string;
  /** Countdown overlay bullet claims. */
  bullets: string[];
  /** Long CTA ("Read Full Privacy Policy"). */
  policyCta: string;
  /** Short CTA ("Privacy Policy"). */
  policyCtaShort: string;
  /** Contact prompt ("Questions?"). */
  contactPrompt: string;
  /** Aggregate-anonymity assurance (Studio Classic final slide). */
  aggregateHeading: string;
  aggregateBody: string;
  /** Studio Classic multi-slide content. */
  slides: PrivacySlide[];
  /** Slide counter connector, e.g. "1 {of} 3". */
  slideOf: string;
}

// English master — the single source of truth for the in-Creative Privacy strings.
const EN: SystemPrivacy = {
  label: "Privacy",
  back: "Back",
  anonymousHeading: "Your responses are anonymous.",
  bullets: [
    "No personal information collected",
    "No email addresses collected",
    "No cookies required",
    "No individual identifiers stored",
  ],
  policyCta: "Read Full Privacy Policy",
  policyCtaShort: "Privacy Policy",
  contactPrompt: "Questions?",
  aggregateHeading: "Your responses cannot identify you",
  aggregateBody: "Responses are analysed in aggregate and cannot be linked back to individuals.",
  slides: [
    { title: "About Fanometrix", text: "Fanometrix runs short anonymous football fan surveys on behalf of clubs, competitions and media partners.", bullets: null },
    { title: "What we collect", text: null, bullets: [
      { text: "Multiple-choice survey answers only" },
      { text: "Country, country level only, via ad server" },
      { text: "Device type and browser" },
      { text: "Time taken to complete" },
      { text: "No names, emails, IPs or cookies, ever", highlight: true },
    ] },
    { title: "", text: null, bullets: null },
  ],
  slideOf: "of",
};

// Centrally-approved, Fanometrix-owned overlay translations. These are approved
// UI translations of the canonical English system copy above — NOT Publisher
// content, NOT routed through the Survey /translate (DeepL) endpoint, and NOT
// Publisher-editable. Each statement preserves the exact meaning of its English
// source; legal/privacy claims are not paraphrased or softened. Terminology is
// aligned with the already-approved localised Privacy Policy (locales/privacy/*).
// The full Privacy Policy CTA still routes to /[lang]/privacy via privacyPolicyHref.
//
// Supported delivery languages = those with a localised Privacy Policy page
// (PRIVACY_POLICY_LANGS): de, fr, es, it, pt, sv, zh, hi. Chinese is stored under
// the base key "zh"; the delivery code "zh-CN" resolves to it via base-language
// normalisation below. Any language without an entry falls back to English.
const OVERRIDES: Partial<Record<string, SystemPrivacy>> = {
  de: {
    label: "Datenschutz",
    back: "Zurück",
    anonymousHeading: "Ihre Antworten sind anonym.",
    bullets: [
      "Keine persönlichen Informationen erhoben",
      "Keine E-Mail-Adressen erhoben",
      "Keine Cookies erforderlich",
      "Keine individuellen Kennungen gespeichert",
    ],
    policyCta: "Vollständige Datenschutzrichtlinie lesen",
    policyCtaShort: "Datenschutzrichtlinie",
    contactPrompt: "Fragen?",
    aggregateHeading: "Ihre Antworten können Sie nicht identifizieren",
    aggregateBody: "Antworten werden aggregiert ausgewertet und können nicht auf einzelne Personen zurückgeführt werden.",
    slides: [
      { title: "Über Fanometrix", text: "Fanometrix führt kurze, anonyme Fußball-Fanumfragen im Auftrag von Vereinen, Wettbewerben und Medienpartnern durch.", bullets: null },
      { title: "Was wir erheben", text: null, bullets: [
        { text: "Nur Antworten auf Multiple-Choice-Umfragefragen" },
        { text: "Land, nur auf Länderebene, über den Ad-Server" },
        { text: "Gerätetyp und Browser" },
        { text: "Zum Ausfüllen benötigte Zeit" },
        { text: "Niemals Namen, E-Mails, IP-Adressen oder Cookies", highlight: true },
      ] },
      { title: "", text: null, bullets: null },
    ],
    slideOf: "von",
  },
  fr: {
    label: "Confidentialité",
    back: "Retour",
    anonymousHeading: "Vos réponses sont anonymes.",
    bullets: [
      "Aucune information personnelle collectée",
      "Aucune adresse e-mail collectée",
      "Aucun cookie requis",
      "Aucun identifiant individuel stocké",
    ],
    policyCta: "Lire la politique de confidentialité complète",
    policyCtaShort: "Politique de confidentialité",
    contactPrompt: "Des questions ?",
    aggregateHeading: "Vos réponses ne peuvent pas vous identifier",
    aggregateBody: "Les réponses sont analysées de manière agrégée et ne peuvent pas être rattachées à des individus.",
    slides: [
      { title: "À propos de Fanometrix", text: "Fanometrix réalise de courtes enquêtes anonymes auprès des fans de football pour le compte de clubs, de compétitions et de partenaires médias.", bullets: null },
      { title: "Ce que nous collectons", text: null, bullets: [
        { text: "Uniquement les réponses aux questions à choix multiples" },
        { text: "Pays, au niveau du pays uniquement, via le serveur publicitaire" },
        { text: "Type d'appareil et navigateur" },
        { text: "Temps nécessaire pour répondre" },
        { text: "Jamais de noms, e-mails, adresses IP ni cookies", highlight: true },
      ] },
      { title: "", text: null, bullets: null },
    ],
    slideOf: "sur",
  },
  es: {
    label: "Privacidad",
    back: "Volver",
    anonymousHeading: "Sus respuestas son anónimas.",
    bullets: [
      "No se recopila información personal",
      "No se recopilan direcciones de correo electrónico",
      "No se requieren cookies",
      "No se almacenan identificadores individuales",
    ],
    policyCta: "Leer la política de privacidad completa",
    policyCtaShort: "Política de privacidad",
    contactPrompt: "¿Preguntas?",
    aggregateHeading: "Sus respuestas no pueden identificarle",
    aggregateBody: "Las respuestas se analizan de forma agregada y no pueden vincularse a individuos.",
    slides: [
      { title: "Acerca de Fanometrix", text: "Fanometrix realiza encuestas anónimas y breves a aficionados al fútbol en nombre de clubes, competiciones y socios de medios.", bullets: null },
      { title: "Qué recopilamos", text: null, bullets: [
        { text: "Solo respuestas a preguntas de opción múltiple" },
        { text: "País, solo a nivel de país, a través del ad server" },
        { text: "Tipo de dispositivo y navegador" },
        { text: "Tiempo empleado en completarla" },
        { text: "Nunca nombres, correos electrónicos, direcciones IP ni cookies", highlight: true },
      ] },
      { title: "", text: null, bullets: null },
    ],
    slideOf: "de",
  },
  it: {
    label: "Privacy",
    back: "Indietro",
    anonymousHeading: "Le tue risposte sono anonime.",
    bullets: [
      "Nessuna informazione personale raccolta",
      "Nessun indirizzo e-mail raccolto",
      "Nessun cookie richiesto",
      "Nessun identificatore individuale memorizzato",
    ],
    policyCta: "Leggi l'informativa sulla privacy completa",
    policyCtaShort: "Informativa sulla privacy",
    contactPrompt: "Domande?",
    aggregateHeading: "Le tue risposte non possono identificarti",
    aggregateBody: "Le risposte vengono analizzate in forma aggregata e non possono essere ricondotte a singoli individui.",
    slides: [
      { title: "Informazioni su Fanometrix", text: "Fanometrix conduce brevi sondaggi anonimi tra i tifosi di calcio per conto di club, competizioni e partner mediatici.", bullets: null },
      { title: "Cosa raccogliamo", text: null, bullets: [
        { text: "Solo risposte a domande a scelta multipla" },
        { text: "Paese, solo a livello di paese, tramite l'ad server" },
        { text: "Tipo di dispositivo e browser" },
        { text: "Tempo impiegato per completare" },
        { text: "Mai nomi, e-mail, indirizzi IP o cookie", highlight: true },
      ] },
      { title: "", text: null, bullets: null },
    ],
    slideOf: "di",
  },
  pt: {
    label: "Privacidade",
    back: "Voltar",
    anonymousHeading: "As suas respostas são anónimas.",
    bullets: [
      "Nenhuma informação pessoal recolhida",
      "Nenhum endereço de e-mail recolhido",
      "Nenhum cookie necessário",
      "Nenhum identificador individual armazenado",
    ],
    policyCta: "Ler a política de privacidade completa",
    policyCtaShort: "Política de privacidade",
    contactPrompt: "Dúvidas?",
    aggregateHeading: "As suas respostas não podem identificá-lo(a)",
    aggregateBody: "As respostas são analisadas de forma agregada e não podem ser associadas a indivíduos.",
    slides: [
      { title: "Sobre a Fanometrix", text: "A Fanometrix realiza pesquisas anónimas e breves a adeptos de futebol em nome de clubes, competições e parceiros de media.", bullets: null },
      { title: "O que recolhemos", text: null, bullets: [
        { text: "Apenas respostas a perguntas de escolha múltipla" },
        { text: "País, apenas ao nível do país, através do ad server" },
        { text: "Tipo de dispositivo e browser" },
        { text: "Tempo que demorou a completar" },
        { text: "Nunca nomes, e-mails, endereços IP ou cookies", highlight: true },
      ] },
      { title: "", text: null, bullets: null },
    ],
    slideOf: "de",
  },
  sv: {
    label: "Integritet",
    back: "Tillbaka",
    anonymousHeading: "Dina svar är anonyma.",
    bullets: [
      "Ingen personlig information samlas in",
      "Inga e-postadresser samlas in",
      "Inga cookies krävs",
      "Inga individuella identifierare lagras",
    ],
    policyCta: "Läs hela integritetspolicyn",
    policyCtaShort: "Integritetspolicy",
    contactPrompt: "Frågor?",
    aggregateHeading: "Dina svar kan inte identifiera dig",
    aggregateBody: "Svaren analyseras aggregerat och kan inte kopplas till enskilda individer.",
    slides: [
      { title: "Om Fanometrix", text: "Fanometrix genomför korta, anonyma undersökningar bland fotbollsfans på uppdrag av klubbar, tävlingar och mediepartner.", bullets: null },
      { title: "Vad vi samlar in", text: null, bullets: [
        { text: "Endast svar på flervalsfrågor" },
        { text: "Land, endast på landsnivå, via annonsservern" },
        { text: "Enhetstyp och webbläsare" },
        { text: "Tid det tog att slutföra" },
        { text: "Aldrig namn, e-post, IP-adresser eller cookies", highlight: true },
      ] },
      { title: "", text: null, bullets: null },
    ],
    slideOf: "av",
  },
  zh: {
    label: "隐私",
    back: "返回",
    anonymousHeading: "您的回答是匿名的。",
    bullets: [
      "不收集个人信息",
      "不收集电子邮件地址",
      "无需 Cookie",
      "不存储任何个人标识符",
    ],
    policyCta: "阅读完整隐私政策",
    policyCtaShort: "隐私政策",
    contactPrompt: "有疑问？",
    aggregateHeading: "您的回答无法识别您的身份",
    aggregateBody: "回答以汇总方式进行分析，无法追溯到具体个人。",
    slides: [
      { title: "关于 Fanometrix", text: "Fanometrix 代表俱乐部、赛事及媒体合作伙伴开展简短的匿名足球球迷调查。", bullets: null },
      { title: "我们收集的内容", text: null, bullets: [
        { text: "仅限多项选择题的回答" },
        { text: "国家，仅限国家级别，通过广告服务器" },
        { text: "设备类型和浏览器" },
        { text: "完成所用的时间" },
        { text: "绝不收集姓名、电子邮件、IP 地址或 Cookie", highlight: true },
      ] },
      { title: "", text: null, bullets: null },
    ],
    slideOf: "/",
  },
  hi: {
    label: "गोपनीयता",
    back: "वापस",
    anonymousHeading: "आपके उत्तर गुमनाम हैं।",
    bullets: [
      "कोई व्यक्तिगत जानकारी एकत्र नहीं की जाती",
      "कोई ईमेल पता एकत्र नहीं किया जाता",
      "किसी कुकी की आवश्यकता नहीं",
      "कोई व्यक्तिगत पहचानकर्ता संग्रहीत नहीं किया जाता",
    ],
    policyCta: "पूरी गोपनीयता नीति पढ़ें",
    policyCtaShort: "गोपनीयता नीति",
    contactPrompt: "प्रश्न?",
    aggregateHeading: "आपके उत्तर आपकी पहचान नहीं कर सकते",
    aggregateBody: "उत्तरों का विश्लेषण समग्र रूप से किया जाता है और उन्हें किसी व्यक्ति से नहीं जोड़ा जा सकता।",
    slides: [
      { title: "Fanometrix के बारे में", text: "Fanometrix क्लबों, प्रतियोगिताओं और मीडिया भागीदारों की ओर से संक्षिप्त, गुमनाम फुटबॉल प्रशंसक सर्वेक्षण करता है।", bullets: null },
      { title: "हम क्या एकत्र करते हैं", text: null, bullets: [
        { text: "केवल बहुविकल्पीय प्रश्नों के उत्तर" },
        { text: "देश, केवल देश स्तर पर, विज्ञापन सर्वर के माध्यम से" },
        { text: "डिवाइस प्रकार और ब्राउज़र" },
        { text: "पूरा करने में लगा समय" },
        { text: "कभी नहीं: नाम, ईमेल, IP पते या कुकीज़", highlight: true },
      ] },
      { title: "", text: null, bullets: null },
    ],
    slideOf: "/",
  },
};

/**
 * The system Privacy strings for a delivery language (English fallback).
 * Region subtags normalise to their base language, so "zh-CN" resolves the "zh"
 * entry (and any future "pt-BR" → "pt"), matching resolvePrivacyLang().
 */
export function resolveSystemPrivacy(lang: string | null | undefined): SystemPrivacy {
  if (!lang) return EN;
  return OVERRIDES[lang] || OVERRIDES[lang.split("-")[0]] || EN;
}
