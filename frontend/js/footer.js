import { apiRequest, isLoggedIn, getRole } from './api.js';

// ── TikTok accounts (always show all 3 with labels) ──────────────────────────
const TIKTOK_ACCOUNTS = [
  { href: 'https://www.tiktok.com/@serenkits',     name: 'Kits' },
  { href: 'https://www.tiktok.com/@seren.clo',     name: 'Clothing' },
  { href: 'https://www.tiktok.com/@seren.crochett', name: 'Crochets' },
];

const TIKTOK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.52V6.74a4.85 4.85 0 01-1.02-.05z"/></svg>`;

function buildHTML(isCustomer) {
  const socials = `
    <div class="footer-socials">
      ${TIKTOK_ACCOUNTS.map(t => `
        <a class="footer-tiktok" href="${t.href}" target="_blank" rel="noopener" aria-label="${t.name} TikTok">
          ${TIKTOK_SVG}
          <span>${t.name}</span>
        </a>`).join('')}
    </div>`;

  const questionForm = isCustomer ? `
    <div class="footer-question">
      <h4>Ask a Question</h4>
      <p id="qEmailNote" class="footer-q-email">Loading your email…</p>
      <form id="questionForm" novalidate>
        <input  id="qSubject" type="text"  placeholder="Subject"     required autocomplete="off" />
        <textarea id="qMessage"            placeholder="Curious about something? Ask us any question" rows="4" required></textarea>
        <button type="submit" class="btn footer-q-btn">Send Question</button>
        <p id="qFeedback" class="footer-q-feedback" aria-live="polite"></p>
      </form>
    </div>` : '';

  return `
    <div class="footer-top">
      <a class="footer-brand" href="./index.html">SEREN</a>
      ${socials}
    </div>
    ${questionForm}
    <p class="footer-copy">&copy; 2026 SEREN. All rights reserved.</p>`;
}

export async function renderFooter() {
  const isCustomer = isLoggedIn() && getRole() === 'customer';

  // Find or create <footer class="footer">
  let footer = document.querySelector('footer.footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'footer';
    document.body.appendChild(footer);
  }

  footer.innerHTML = buildHTML(isCustomer);

  // ── Ask a question — email fetch + form submit ────────────────────────────
  if (isCustomer) {
    // Fetch email asynchronously and fill the note
    apiRequest('/api/auth/me/', 'GET', null, true)
      .then(({ email }) => {
        const note = document.getElementById('qEmailNote');
        if (note) note.textContent = `We'll reply to: ${email}`;
      })
      .catch(() => {
        const note = document.getElementById('qEmailNote');
        if (note) note.textContent = '';
      });

    document.getElementById('questionForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn      = document.getElementById('questionForm').querySelector('button[type="submit"]');
      const feedback = document.getElementById('qFeedback');
      const subject  = document.getElementById('qSubject').value.trim();
      const message  = document.getElementById('qMessage').value.trim();

      if (!subject || !message) {
        feedback.textContent = 'Please fill in both Subject and Message.';
        feedback.style.color = '#ff6b6b';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Sending…';
      feedback.textContent = '';

      try {
        const res = await apiRequest('/api/auth/ask-question/', 'POST', { subject, message }, true);
        document.getElementById('questionForm').reset();
        feedback.textContent = res.detail || 'Question sent!';
        feedback.style.color = '#25d366';
        btn.textContent = 'Send Question';
        setTimeout(() => { btn.disabled = false; feedback.textContent = ''; }, 4000);
      } catch (err) {
        feedback.textContent = err.message || 'Failed to send. Please try again.';
        feedback.style.color = '#ff6b6b';
        btn.disabled = false;
        btn.textContent = 'Send Question';
      }
    });
  }
}
