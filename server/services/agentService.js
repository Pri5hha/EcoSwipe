const db = require('../db');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';

// Real categories in this marketplace (see server/index.js serviceCatalog) — not a literal
// plumber/electrician trade list. The system prompt maps trade-style user language onto these.
const SERVICE_CATEGORIES = ['Home Care', 'Repairs', 'Auto Care', 'Lifestyle', 'Outdoor', 'Errands'];

const SYSTEM_PROMPT = `You are EcoSwipe's booking assistant. EcoSwipe is a sustainable on-demand home services marketplace with these service categories: ${SERVICE_CATEGORIES.join(', ')}.

Extract from the user's message:
1. service_type: one of [${SERVICE_CATEGORIES.join(', ')}], or null if unclear. Map trade language onto these categories — plumber/electrician/appliance repair -> "Repairs", cleaner/deep clean -> "Home Care", carpenter/furniture -> "Home Care" or "Repairs" (pick the closer fit), painter -> "Home Care", car/EV/bike service -> "Auto Care", gardening/solar/outdoor -> "Outdoor", grocery/courier/delivery -> "Errands", meal prep/pet care/events -> "Lifestyle".
2. budget_max (number in INR, null if not mentioned)
3. eco_preference (boolean, true if they mention eco/green/electric/sustainable/solar)
4. urgency (low/medium/high)
5. time_preference (morning/afternoon/evening/specific date, or null)
6. region (location mentioned, e.g. a neighborhood name, or null)

If the user's message is a refinement of an earlier request in this conversation (e.g. "make it cheaper", "actually make it eco-friendly too"), reuse the fields from earlier turns and only change what the new message implies. For a budget refinement with no explicit number (e.g. "cheaper", "lower budget"), reduce the previous budget_max by about 20%.

Return ONLY a JSON object with these 6 fields. No explanation, no markdown fences.`;

const ORDINAL_WORDS = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2 };
const BUDGET_REFINEMENT_RE = /cheaper|less expensive|lower budget|more affordable|reduce (the )?(price|budget)|drop the price/;

/**
 * Detects follow-ups like "the second one" or "book the first one" so they can be
 * resolved against the previously shown provider list instead of re-querying Claude/the DB.
 */
function resolveOrdinalReference(message) {
  const text = String(message || '').toLowerCase();
  const match = text.match(/\b(first|1st|second|2nd|third|3rd)\b/);
  if (!match) return null;
  return { index: ORDINAL_WORDS[match[1]], wantsBooking: /\bbook\b/.test(text) };
}

/**
 * Carries forward fields the current turn didn't mention (service_type/region/eco/time),
 * and applies a ~20% budget cut when the message is a "make it cheaper" style refinement
 * with no explicit new number.
 */
function mergeIntent(intent, previousIntent, message) {
  if (!previousIntent) return intent;
  const merged = { ...intent };
  if (!merged.service_type) merged.service_type = previousIntent.service_type;
  if (!merged.region) merged.region = previousIntent.region;
  if (!merged.eco_preference && previousIntent.eco_preference) merged.eco_preference = true;
  if (!merged.time_preference) merged.time_preference = previousIntent.time_preference;
  if (!merged.budget_max) {
    const isCheaperRefinement = BUDGET_REFINEMENT_RE.test(String(message || '').toLowerCase());
    merged.budget_max =
      isCheaperRefinement && previousIntent.budget_max
        ? Math.round(previousIntent.budget_max * 0.8)
        : previousIntent.budget_max;
  }
  return merged;
}

function extractJsonObject(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeIntent(raw) {
  const intent = raw && typeof raw === 'object' ? raw : {};
  const serviceType = SERVICE_CATEGORIES.includes(intent.service_type) ? intent.service_type : null;
  const budgetMax = Number.isFinite(Number(intent.budget_max)) && Number(intent.budget_max) > 0 ? Number(intent.budget_max) : null;
  const urgency = ['low', 'medium', 'high'].includes(intent.urgency) ? intent.urgency : 'medium';
  return {
    service_type: serviceType,
    budget_max: budgetMax,
    eco_preference: Boolean(intent.eco_preference),
    urgency,
    time_preference: intent.time_preference ? String(intent.time_preference).trim() : null,
    region: intent.region ? String(intent.region).trim() : null
  };
}

/**
 * Calls Claude to turn a natural-language booking request into structured intent.
 * Falls back to regex-based extraction if the API key is missing or the call fails.
 */
async function extractBookingIntent(message, conversationHistory = [], previousIntent = null) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return {
      intent: mergeIntent(handleFallback(message), previousIntent, message),
      usedFallback: true,
      reason: 'missing_api_key'
    };
  }

  const history = (conversationHistory || [])
    .slice(-8)
    .filter((turn) => turn && turn.role && turn.content)
    .map((turn) => ({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: String(turn.content) }));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: [...history, { role: 'user', content: message }]
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Claude API responded with ${response.status}`);
    }

    const data = await response.json();
    const text = (data.content || []).find((block) => block.type === 'text')?.text || '';
    const parsed = extractJsonObject(text);
    if (!parsed) {
      throw new Error('Could not parse JSON from Claude response');
    }

    return { intent: mergeIntent(normalizeIntent(parsed), previousIntent, message), usedFallback: false };
  } catch (error) {
    return {
      intent: mergeIntent(handleFallback(message), previousIntent, message),
      usedFallback: true,
      reason: error.message
    };
  }
}

/**
 * Regex-based backup extraction used when the Claude API is unavailable or errors out.
 */
function handleFallback(message) {
  const text = String(message || '').toLowerCase();

  const categoryKeywords = [
    { category: 'Repairs', words: ['plumber', 'plumbing', 'electrician', 'repair', 'fix', 'appliance', 'leak'] },
    { category: 'Home Care', words: ['clean', 'cleaner', 'cleaning', 'paint', 'painter', 'deep clean'] },
    { category: 'Auto Care', words: ['car', 'ev', 'vehicle', 'bike service', 'auto'] },
    { category: 'Outdoor', words: ['garden', 'gardening', 'solar', 'lawn', 'plant'] },
    { category: 'Errands', words: ['grocery', 'courier', 'delivery', 'errand', 'pickup'] },
    { category: 'Lifestyle', words: ['meal', 'pet', 'grooming', 'event'] }
  ];
  let service_type = null;
  for (const entry of categoryKeywords) {
    if (entry.words.some((word) => text.includes(word))) {
      service_type = entry.category;
      break;
    }
  }

  const budgetMatch = text.match(/(?:under|below|budget\s*(?:of)?|less than)\s*[₹$]?\s*(\d{2,6})/) || text.match(/[₹$]\s*(\d{2,6})/);
  const budget_max = budgetMatch ? Number(budgetMatch[1]) : null;

  const eco_preference = /\beco|\bgreen|\belectric|\bsustainable|\bsolar/.test(text);

  let urgency = 'medium';
  if (/urgent|asap|immediately|right now|emergency/.test(text)) {
    urgency = 'high';
  } else if (/whenever|no rush|flexible|next week/.test(text)) {
    urgency = 'low';
  }

  let time_preference = null;
  if (/morning/.test(text)) time_preference = 'morning';
  else if (/afternoon/.test(text)) time_preference = 'afternoon';
  else if (/evening|tonight/.test(text)) time_preference = 'evening';
  else if (/tomorrow/.test(text)) time_preference = 'tomorrow';
  else if (/saturday|sunday|monday|tuesday|wednesday|thursday|friday/.test(text)) {
    time_preference = text.match(/saturday|sunday|monday|tuesday|wednesday|thursday|friday/)[0];
  }

  const regionMatch = text.match(/\bin\s+([a-z][a-z\s]{2,24}?)(?:\.|,|$| under| for| this| tomorrow)/);
  const region = regionMatch ? regionMatch[1].trim().replace(/\b\w/g, (c) => c.toUpperCase()) : null;

  return { service_type, budget_max, eco_preference, urgency, time_preference, region };
}

const DAY_PART_HOURS = { morning: [9, 12], afternoon: [12, 17], evening: [17, 20] };

function slotMatchesTimePreference(slots, timePreference) {
  if (!timePreference || !DAY_PART_HOURS[timePreference]) return true;
  const [start, end] = DAY_PART_HOURS[timePreference];
  return (slots || []).some((slot) => {
    const hour = Number(String(slot).split(':')[0]);
    return Number.isFinite(hour) && hour >= start && hour < end;
  });
}

/**
 * Queries the providers table for matches to the extracted intent, with graceful
 * loosening (region -> budget -> eco) if the strict query returns nothing.
 */
function findMatchingProviders(intent, limit = 3) {
  const buildQuery = ({ withRegion, withBudget, withEco }) => {
    const clauses = [];
    const params = [];
    if (intent.service_type) {
      clauses.push('category = ?');
      params.push(intent.service_type);
    }
    if (withBudget && intent.budget_max) {
      clauses.push('price_per_hour <= ?');
      params.push(intent.budget_max);
    }
    if (withEco && intent.eco_preference) {
      clauses.push('eco_rating >= 70');
    }
    if (withRegion && intent.region) {
      clauses.push('region = ?');
      params.push(intent.region);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return db.prepare(`SELECT * FROM providers ${where} ORDER BY trust_score DESC, eco_rating DESC`).all(...params);
  };

  let rows = buildQuery({ withRegion: true, withBudget: true, withEco: true });
  let loosened = false;
  if (!rows.length && intent.region) {
    rows = buildQuery({ withRegion: false, withBudget: true, withEco: true });
    loosened = true;
  }
  if (!rows.length && intent.budget_max) {
    rows = buildQuery({ withRegion: false, withBudget: false, withEco: true });
    loosened = true;
  }
  if (!rows.length && intent.eco_preference) {
    rows = buildQuery({ withRegion: false, withBudget: false, withEco: false });
    loosened = true;
  }
  if (!rows.length && intent.service_type) {
    rows = db.prepare('SELECT * FROM providers ORDER BY trust_score DESC, eco_rating DESC').all();
    loosened = true;
  }

  const ranked = rows
    .map((row) => ({
      ...row,
      availability_slots: JSON.parse(row.availability_slots || '[]'),
      timeMatch: slotMatchesTimePreference(JSON.parse(row.availability_slots || '[]'), intent.time_preference)
    }))
    .sort((a, b) => Number(b.timeMatch) - Number(a.timeMatch) || b.trust_score - a.trust_score);

  return { providers: ranked.slice(0, limit), loosened, exact: rows.length > 0 && !loosened };
}

/**
 * Generates a natural-language summary of the matched providers for the chat reply.
 */
function formatProviderResults(providers, intent = {}) {
  if (!providers.length) {
    return "I couldn't find any providers matching that request just yet. Try widening your budget or dropping the eco filter and I'll take another look.";
  }

  const ecoLabel = intent.eco_preference ? 'eco-friendly ' : '';
  const categoryLabel = intent.service_type ? `${intent.service_type.toLowerCase()} ` : '';
  const regionLabel = intent.region ? ` in ${intent.region}` : '';
  const budgetLabel = intent.budget_max ? ` under ₹${intent.budget_max}` : '';

  const top = providers[0];
  const summaryLine = `I found ${providers.length} ${ecoLabel}${categoryLabel}provider${providers.length > 1 ? 's' : ''}${regionLabel}${budgetLabel}.`;
  const topLine = `Top pick: ${top.name} (Trust Score: ${top.trust_score}%, Carbon saved: ${top.carbon_score}kg).`;

  return `${summaryLine} ${topLine}`;
}

module.exports = {
  extractBookingIntent,
  findMatchingProviders,
  formatProviderResults,
  handleFallback,
  resolveOrdinalReference,
  SERVICE_CATEGORIES
};
