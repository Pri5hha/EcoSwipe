const express = require('express');
const db = require('../db');
const agentRateLimit = require('../middleware/agentRateLimit');
const {
  extractBookingIntent,
  findMatchingProviders,
  formatProviderResults,
  resolveOrdinalReference
} = require('../services/agentService');

const insertConversation = db.prepare(
  `INSERT INTO agent_conversations (user_id, session_id, message, role, extracted_intent, providers_returned, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const getLastAssistantTurn = db.prepare(
  `SELECT extracted_intent, providers_returned FROM agent_conversations
   WHERE session_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1`
);

function logConversation({ userId, sessionId, message, role, extractedIntent, providersReturned }) {
  insertConversation.run(
    userId,
    sessionId,
    message,
    role,
    extractedIntent ? JSON.stringify(extractedIntent) : null,
    providersReturned ? JSON.stringify(providersReturned) : null,
    new Date().toISOString()
  );
}

/**
 * Builds the agent router. authRequired/csrfRequired are injected from server/index.js so this
 * file doesn't duplicate the app's auth/session logic.
 */
function createAgentRouter({ authRequired, csrfRequired }) {
  const router = express.Router();

  router.post('/chat', authRequired, csrfRequired, agentRateLimit, async (req, res) => {
    const message = String(req.body?.message || '').trim();
    const conversationHistory = Array.isArray(req.body?.conversationHistory) ? req.body.conversationHistory : [];
    const sessionId = String(req.body?.sessionId || `${req.user.id}-session`);

    if (!message) {
      return res.status(400).json({ error: 'Message is required.' });
    }
    if (message.length > 500) {
      return res.status(400).json({ error: 'Message is too long (max 500 characters).' });
    }

    // Pull the prior turn's extracted intent + shown providers (per session) so follow-up
    // messages ("make it cheaper", "book the first one") have context to resolve against.
    const previousTurn = getLastAssistantTurn.get(sessionId);
    const previousIntent = previousTurn?.extracted_intent ? JSON.parse(previousTurn.extracted_intent) : null;
    const previousProviders = previousTurn?.providers_returned ? JSON.parse(previousTurn.providers_returned) : [];

    const ordinal = resolveOrdinalReference(message);
    if (ordinal && previousProviders[ordinal.index]) {
      const provider = previousProviders[ordinal.index];
      logConversation({ userId: req.user.id, sessionId, message, role: 'user', extractedIntent: null, providersReturned: null });

      const reply = ordinal.wantsBooking
        ? `Great — I've pre-filled the booking form for ${provider.name}.`
        : `${provider.name} — ₹${provider.price_per_hour}/hr, Trust Score: ${provider.trust_score}%, Carbon saved: ${provider.carbon_score}kg, ${provider.region}.`;

      logConversation({
        userId: req.user.id,
        sessionId,
        message: reply,
        role: 'assistant',
        extractedIntent: previousIntent,
        providersReturned: [provider]
      });

      return res.json({
        reply,
        intent: previousIntent,
        providers: [provider],
        action: ordinal.wantsBooking ? 'book' : undefined,
        provider: ordinal.wantsBooking ? provider : undefined,
        usedFallback: false,
        sessionId
      });
    }

    if (!process.env.CLAUDE_API_KEY) {
      logConversation({ userId: req.user.id, sessionId, message, role: 'user', extractedIntent: null, providersReturned: null });
      const reply = 'AI assistant temporarily unavailable. Please use the booking form directly, or try again shortly.';
      logConversation({ userId: req.user.id, sessionId, message: reply, role: 'assistant', extractedIntent: null, providersReturned: null });
      return res.json({ reply, intent: null, providers: [], usedFallback: true, sessionId });
    }

    logConversation({ userId: req.user.id, sessionId, message, role: 'user', extractedIntent: null, providersReturned: null });

    let extraction;
    try {
      extraction = await extractBookingIntent(message, conversationHistory, previousIntent);
    } catch (error) {
      // extractBookingIntent already falls back internally; this only guards against
      // truly unexpected errors (e.g. a bug in the fallback path itself).
      const reply = "Something went wrong understanding that request. Could you rephrase it?";
      logConversation({ userId: req.user.id, sessionId, message: reply, role: 'assistant', extractedIntent: null, providersReturned: null });
      return res.status(500).json({ error: reply });
    }

    const { intent, usedFallback } = extraction;
    const { providers, exact } = findMatchingProviders(intent, 3);

    const providersPayload = providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      category: provider.category,
      price_per_hour: provider.price_per_hour,
      eco_rating: provider.eco_rating,
      trust_score: provider.trust_score,
      region: provider.region,
      carbon_score: provider.carbon_score,
      availability_slots: provider.availability_slots
    }));

    let reply = formatProviderResults(providersPayload, intent);
    if (providers.length && !exact) {
      reply = `No exact matches found. Here are similar services nearby: ${reply}`;
    }

    logConversation({
      userId: req.user.id,
      sessionId,
      message: reply,
      role: 'assistant',
      extractedIntent: intent,
      providersReturned: providersPayload
    });

    return res.json({ reply, intent, providers: providersPayload, usedFallback, sessionId });
  });

  return router;
}

module.exports = createAgentRouter;
