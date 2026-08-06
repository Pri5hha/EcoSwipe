(function () {
  const SUGGESTED_PROMPTS = [
    'Find eco plumber under ₹500',
    'Book cleaner for tomorrow morning',
    'Urgent electrician needed today'
  ];

  const CATEGORY_EMOJI = {
    'Home Care': '🧹',
    Repairs: '🔧',
    'Auto Care': '🚗',
    Lifestyle: '🌿',
    Outdoor: '🌳',
    Errands: '📦'
  };

  const agent = {
    isOpen: false,
    loading: false,
    conversationHistory: [],
    sessionId: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    els: {}
  };

  function csrfToken() {
    return (typeof state !== 'undefined' && state.csrfToken) || '';
  }

  function currentUserId() {
    return (typeof state !== 'undefined' && state.user && state.user.id) || null;
  }

  function trustClass(score) {
    if (score >= 80) return 'agent-provider__trust--high';
    if (score >= 60) return 'agent-provider__trust--mid';
    return 'agent-provider__trust--low';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text == null ? '' : text);
    return div.innerHTML;
  }

  function buildWidget() {
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'agent-fab';
    fab.setAttribute('aria-label', 'Open EcoSwipe booking assistant');
    fab.textContent = '🤖';

    const panel = document.createElement('div');
    panel.className = 'agent-panel';
    panel.innerHTML = `
      <div class="agent-panel__header">
        <div class="agent-panel__header-title"><span>🤖</span><span>EcoSwipe Booking Assistant</span></div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button type="button" class="agent-panel__close" data-role="reset" title="Clear conversation">↺</button>
          <button type="button" class="agent-panel__close" data-role="close" title="Close">✕</button>
        </div>
      </div>
      <div class="agent-panel__messages" data-role="messages"></div>
      <div class="agent-suggested" data-role="suggested"></div>
      <div class="agent-panel__input-row">
        <input type="text" class="agent-panel__input" data-role="input" placeholder="Ask for a service..." maxlength="500" />
        <button type="button" class="agent-panel__send" data-role="send" aria-label="Send">➤</button>
      </div>
      <div class="agent-panel__badge">Powered by Claude AI</div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    agent.els = {
      fab,
      panel,
      messages: panel.querySelector('[data-role="messages"]'),
      suggested: panel.querySelector('[data-role="suggested"]'),
      input: panel.querySelector('[data-role="input"]'),
      send: panel.querySelector('[data-role="send"]'),
      close: panel.querySelector('[data-role="close"]'),
      reset: panel.querySelector('[data-role="reset"]')
    };

    renderSuggestedPrompts();

    fab.addEventListener('click', () => setOpen(!agent.isOpen));
    agent.els.close.addEventListener('click', () => setOpen(false));
    agent.els.reset.addEventListener('click', clearConversation);
    agent.els.send.addEventListener('click', handleSend);
    agent.els.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') handleSend();
    });
  }

  function setOpen(open) {
    const wasOpen = agent.isOpen;
    agent.isOpen = open;
    agent.els.panel.classList.toggle('is-open', open);
    agent.els.fab.classList.toggle('is-hidden', open);
    if (open) {
      agent.els.input.focus();
    } else if (wasOpen) {
      // Conversation memory is scoped to one open session — start fresh next time.
      clearConversation();
    }
  }

  function renderSuggestedPrompts() {
    if (!agent.els.suggested) return;
    if (agent.conversationHistory.length > 0) {
      agent.els.suggested.innerHTML = '';
      return;
    }
    agent.els.suggested.innerHTML = SUGGESTED_PROMPTS.map(
      (prompt) => `<button type="button" class="agent-suggested__chip">${escapeHtml(prompt)}</button>`
    ).join('');
    agent.els.suggested.querySelectorAll('.agent-suggested__chip').forEach((chip, index) => {
      chip.addEventListener('click', () => sendMessage(SUGGESTED_PROMPTS[index]));
    });
  }

  function addMessage(role, content, { isError = false } = {}) {
    const bubble = document.createElement('div');
    bubble.className = `agent-msg agent-msg--${isError ? 'error' : role}`;
    bubble.textContent = content;
    agent.els.messages.appendChild(bubble);
    agent.els.messages.scrollTop = agent.els.messages.scrollHeight;
    return bubble;
  }

  function renderProviderCard(provider) {
    const card = document.createElement('div');
    card.className = 'agent-provider';
    const emoji = CATEGORY_EMOJI[provider.category] || '🛠️';
    const ecoBadge = provider.eco_rating >= 70 ? '<span class="agent-provider__eco-badge">🌱 Eco</span>' : '';
    card.innerHTML = `
      <div class="agent-provider__top">
        <span class="agent-provider__name">${emoji} ${escapeHtml(provider.name)}</span>
        <span class="agent-provider__trust ${trustClass(provider.trust_score)}">${provider.trust_score}%</span>
      </div>
      <div class="agent-provider__meta">
        <span>₹${provider.price_per_hour}/hr</span>
        <span>🌍 ${provider.carbon_score}kg saved</span>
        <span>${escapeHtml(provider.region || '')}</span>
        ${ecoBadge}
      </div>
      <button type="button" class="agent-provider__book">Book Now</button>
    `;
    card.querySelector('.agent-provider__book').addEventListener('click', () => bookNow(provider));
    agent.els.messages.appendChild(card);
    agent.els.messages.scrollTop = agent.els.messages.scrollHeight;
  }

  function bookNow(provider) {
    const select = document.getElementById('bookingService');
    if (select) {
      select.value = provider.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const formPanel = document.getElementById('bookingForm') || select;
      formPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (typeof showToast === 'function') {
      showToast(`${provider.name} pre-filled in the booking form.`);
    }
    setOpen(false);
  }

  function showTyping() {
    const typing = document.createElement('div');
    typing.className = 'agent-typing';
    typing.setAttribute('data-role', 'typing');
    typing.innerHTML = '<span></span><span></span><span></span>';
    agent.els.messages.appendChild(typing);
    agent.els.messages.scrollTop = agent.els.messages.scrollHeight;
    return typing;
  }

  function hideTyping(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  async function postChat(message) {
    const res = await fetch('/api/agent/chat', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken()
      },
      body: JSON.stringify({
        message,
        userId: currentUserId(),
        conversationHistory: agent.conversationHistory,
        sessionId: agent.sessionId
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || 'Request failed');
    }
    return payload;
  }

  async function sendMessage(text) {
    const message = String(text || '').trim();
    if (!message || agent.loading) return;

    agent.els.input.value = '';
    addMessage('user', message);
    agent.conversationHistory.push({ role: 'user', content: message });
    renderSuggestedPrompts();

    agent.loading = true;
    agent.els.send.disabled = true;
    const typingNode = showTyping();

    let payload;
    try {
      payload = await postChat(message);
    } catch (firstError) {
      try {
        payload = await postChat(message);
      } catch (secondError) {
        hideTyping(typingNode);
        agent.loading = false;
        agent.els.send.disabled = false;
        addMessage('assistant', secondError.message || 'Something went wrong. Please try again.', { isError: true });
        return;
      }
    }

    hideTyping(typingNode);
    agent.loading = false;
    agent.els.send.disabled = false;

    addMessage('assistant', payload.reply);
    agent.conversationHistory.push({ role: 'assistant', content: payload.reply });

    (payload.providers || []).forEach((provider) => renderProviderCard(provider));

    // Server resolved a "book the first/second/third one" follow-up — act on it directly.
    if (payload.action === 'book' && payload.provider) {
      bookNow(payload.provider);
    }
  }

  function handleSend() {
    sendMessage(agent.els.input.value);
  }

  function clearConversation() {
    agent.conversationHistory = [];
    agent.sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    agent.els.messages.innerHTML = '';
    renderSuggestedPrompts();
  }

  function init() {
    buildWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
