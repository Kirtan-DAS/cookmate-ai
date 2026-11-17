export type GroceryCandidate = {
  id: number;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  selected: boolean;
};

const NOISE = /\b(?:gstin|cgst|sgst|igst|gst|invoice|receipt|cashier|customer|address|phone|mobile|contact|supermart|supermarket|avenue|regd|hdfc|bank|payment|upi|transaction|subtotal|grand\s+total|total\s+amount|discount|saving|tax|balance|change|round\s*off|thank|welcome|visit\s+again|date|time|tin|fssai|www|http|pin\s*code|mrp|net\s+payable|bill\s+no|item\s+code|hsn|credit\s+card|debit\s+card)\b/i;
const GROCERY = /\b(?:atta|flour|rice|basmati|dal|dhal|lentil|oil|sunflower|ghee|butter|milk|curd|yogurt|paneer|cheese|bread|egg|eggs|salt|sugar|jaggery|tea|coffee|biscuit|cookie|noodle|pasta|oats|cereal|poha|rava|sooji|wheat|maida|besan|chana|moong|toor|tur|urad|masoor|rajma|chickpea|beans|peas|tomato|potato|onion|garlic|ginger|carrot|cabbage|spinach|palak|chilli|chili|pepper|turmeric|haldi|cumin|jeera|mustard|coriander|dhaniya|masala|spice|chicken|fish|meat|apple|banana|orange|mango|grape|lemon|lime|coconut|almond|cashew|peanut|nuts|dates|honey|jam|pickle|sauce|ketchup|water|juice|corn|cucumber|capsicum|cauliflower|broccoli|beetroot|okra|bhindi|brinjal|eggplant|mushroom|idli|dosa|chocolate|chips|snack|parle|maggi|aashirvaad|ashirvaad|amul|tata|fortune|freedom|india\s+gate|daawat|saffola|britannia|nestle|heritage|mother\s+dairy|red\s+label)\b/i;
const PACK = /\b(\d+(?:\.\d+)?)\s*(kg|kgs?|g|gm|gms|grams?|l|ltr|litres?|liters?|ml|pcs?|pieces?|packets?|packs?)\b/i;
const PACK_ONLY = /^\s*\d+(?:\.\d+)?\s*(?:kg|kgs?|g|gm|gms|grams?|l|ltr|litres?|liters?|ml|pcs?|pieces?|packets?|packs?)\s*$/i;
const PRICE = /\d{1,6}[.,]\d{2}/g;

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase();
  if (/^kgs?$/.test(u)) return "kg";
  if (/^(g|gm|gms|grams?)$/.test(u)) return "g";
  if (/^(l|ltr|litres?|liters?)$/.test(u)) return "L";
  if (u === "ml") return "ml";
  return "pieces";
}

function cleanName(input: string): string {
  let name = input
    .replace(/[|_—–=]+/g, " ")
    .replace(/^\s*[-*#]+\s*/, "")
    .replace(/^\s*(?:[a-z]{1,2}\s+){1,3}(?=\d{3,7}\b)/i, "")
    .replace(/^\s*\d{3,7}\s+/, "")
    .replace(/^\s*\d{1,3}\s*[-.)]\s*/, "")
    .replace(/\s+/g, " ").trim();
  // Remove price columns from the FIRST decimal price onward; these aren't product names.
  const priceMatch = PRICE.exec(name);
  PRICE.lastIndex = 0;
  if (priceMatch?.index !== undefined) name = name.slice(0, priceMatch.index).trim();
  name = name.replace(/\s+\d{1,2}\s*$/, "").replace(/\s+(?:[a-z]{1,2}\s*){1,2}$/i, "").trim();
  // Only expand well-known abbreviations; never invent unknown product details.
  const aliases: Array<[RegExp, string]> = [
    [/^aashirvaad(?:\s+atta)?$/i, "Aashirvaad Atta"],
    [/^freedom\s+sunflower(?:\s+oil)?$/i, "Freedom Sunflower Oil"],
    [/^india\s+gate\s+basmati(?:\s+rice)?$/i, "India Gate Basmati Rice"],
    [/^amul(?:\s+butter)?$/i, "Amul Butter"],
    [/^red\s+label(?:\s+tea)?$/i, "Red Label Tea"],
    [/^parle[-\s]?g\s+gold$/i, "Parle-G Gold"],
  ];
  for (const [pattern, replacement] of aliases) {
    if (pattern.test(name)) return replacement;
  }
  return name.replace(/\b[a-z]/g, ch => ch.toUpperCase());
}

export function extractGroceryCandidates(rawText: string): GroceryCandidate[] {
  const lines = rawText.split(/\r?\n/).map(s => s.replace(/[|]/g, " ").replace(/\s+/g, " ").trim());
  const result: GroceryCandidate[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.length < 3 || line.length > 220 || NOISE.test(line)) continue;
    if (/^[\d\s.,₹\-+]+$/.test(line) || /\b\d{10,}\b/.test(line)) continue;
    // Price starts at the first decimal number (e.g. 180.00). Keep the part before it.
    const priceMatch = /\b\d{1,6}[.,]\d{2}\b/.exec(line);
    let left = priceMatch ? line.slice(0, priceMatch.index).trim() : line;
    // Receipt item code and OCR fragments precede the actual product name.
    left = left.replace(/^.*?\b\d{3,7}\s+(?=[A-Za-z])/, "");
    if (!GROCERY.test(left)) continue;
    const embedded = PACK.exec(left);
    const nextLinePack = !embedded && i + 1 < lines.length && PACK_ONLY.test(lines[i + 1])
      ? PACK.exec(lines[i + 1]) : null;
    const pack = embedded || nextLinePack;
    let quantity = "";
    let unit = "";
    if (pack) {
      quantity = pack[1];
      unit = normalizeUnit(pack[2]);
      if (embedded) left = left.replace(embedded[0], " ");
      if (nextLinePack) i++;
    }
    // For product rows like "PARLE-G GOLD 2 60.00 ...", 2 is purchased pack count.
    const countMatch = /\s+(\d{1,2})\s*$/.exec(left);
    const count = countMatch ? Number(countMatch[1]) : 1;
    if (countMatch) left = left.slice(0, countMatch.index).trim();
    if (pack && count > 1 && count <= 30) {
      quantity = String(Number(quantity) * count);
    }
    const name = cleanName(left);
    if (name.length < 3 || name.length > 75 || !GROCERY.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ id: result.length, name, quantity, unit, category: "", selected: false });
  }
  return result;
}
