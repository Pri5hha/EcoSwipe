const rateLimit = require('express-rate-limit');

// 20 booking-agent requests per user per hour.
const agentRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    const resetMs = req.rateLimit?.resetTime ? req.rateLimit.resetTime.getTime() - Date.now() : 60 * 60 * 1000;
    const minutes = Math.max(1, Math.ceil(resetMs / 60000));
    res.status(429).json({ error: `You've reached the chat limit. Try again in ${minutes} minutes.` });
  }
});

module.exports = agentRateLimit;
