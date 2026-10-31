const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const prompts = ['كيف أقيّم دكتورًا؟', 'كيف أغيّر جامعتي أو تخصصي؟', 'هل أقدر أقيّم الدكتور في أكثر من مادة؟', 'ليش درجتي ظاهرة في التقييم؟', 'وين الرسم الهندسي في خطتي؟', 'كيف أختار دكتورًا لمادة مشتركة؟'];
export function createAssistant({ api, ensureGuestSession, universityId, universityName, configured }) {
  let messages = [], pending = false, error = '', ready = null, scope, revision = 0;
  const checkScope = () => {
    const next = universityId() || null;
    if (next !== scope) { scope = next; messages = []; error = ''; revision++; }
  };
  const transcript = () => messages.map((message) => `<article class="assistant-message ${message.role}" aria-label="${message.role === 'user' ? 'سؤالك' : 'رد مساعد مِعيار'}"><b>${message.role === 'user' ? 'أنت' : 'مساعد مِعيار'}</b><p>${escape(message.text)}</p>${message.sources?.length ? `<div class="assistant-sources"><span>المصادر من مِعيار</span>${message.sources.map((source) => `<a href="${escape(source.href)}">${escape(source.label)}</a>`).join('')}</div>` : ''}</article>`).join('');
  const paint = () => {
    const log = document.querySelector('#assistant-log');
    if (!log) return;
    log.innerHTML = transcript() + (pending ? '<p class="assistant-thinking" role="status">أراجع بيانات مِعيار المنشورة…</p>' : '');
    log.scrollTop = log.scrollHeight;
    const warning = document.querySelector('#assistant-error');
    warning.textContent = error;
    const submit = document.querySelector('#assistant-form [type=submit]');
    if (submit) submit.disabled = pending || ready !== true;
    document.querySelector('#assistant-clear').disabled = pending || !messages.length;
    document.querySelectorAll('[data-assistant-prompt]').forEach((button) => button.disabled = pending || ready !== true);
  };
  return {
    reset() { messages = []; error = ''; scope = undefined; revision++; },
    page() {
      checkScope();
      return `<section class="assistant-page"><div class="page-title"><div class="eyebrow">اسأل مِعيار</div><h1>مساعد مِعيار</h1><p>أساعدك في استخدام المنصة وفهم بيانات الدكاترة والتقييمات المنشورة.</p></div><div class="panel assistant-panel"><div class="assistant-toolbar"><span>${escape(universityName() || 'جميع جامعات مِعيار')}</span><button class="text-button" id="assistant-clear" type="button">محادثة جديدة</button></div><p id="assistant-availability" class="muted" role="status">${configured() ? 'جارٍ التحقق من توفر المساعد…' : 'المساعد يحتاج الاتصال بالمنصة.'}</p><div class="assistant-prompts">${prompts.map((prompt) => `<button type="button" class="secondary" data-assistant-prompt="${escape(prompt)}">${prompt}</button>`).join('')}</div><div id="assistant-log" class="assistant-log" role="log" aria-label="محادثة مساعد مِعيار" aria-live="polite"></div><form id="assistant-form"><label for="assistant-question">سؤالك<textarea id="assistant-question" name="question" rows="2" minlength="2" maxlength="1200" required placeholder="اسأل عن مِعيار أو عن دكتور في جامعتك…"></textarea></label><button class="primary" type="submit">إرسال السؤال</button></form><p id="assistant-error" class="form-error" role="alert"></p><p class="assistant-note">قد يخطئ المساعد؛ راجع المصادر المرفقة. السؤال والبيانات العامة ذات الصلة يُرسلان لخدمة الذكاء الاصطناعي. لا تضف بيانات شخصية. المحادثة مؤقتة ولا تُحفظ في حسابك.</p></div></section>`;
    },
    async bind() {
      if (!document.querySelector('#assistant-form')) return;
      const form = document.querySelector('#assistant-form'), input = document.querySelector('#assistant-question');
      document.querySelector('#assistant-clear').onclick = () => { messages = []; error = ''; paint(); input.focus(); };
      form.onsubmit = async (event) => {
        event.preventDefault();
        if (pending || ready !== true || !input.value.trim()) return;
        const question = input.value.trim(), previous = messages.slice(-6).map(({ role, text }) => ({ role, text }));
        while (previous.reduce((sum, message) => sum + message.text.length, 0) > 8000) previous.shift();
        while (previous.length && new TextEncoder().encode(JSON.stringify({ question, history: previous })).length > 14500) previous.shift();
        const owner = revision;
        pending = true; error = ''; messages.push({ role: 'user', text: question }); input.value = ''; paint();
        try {
          await ensureGuestSession();
          const result = await api('guest.ai.ask', { question, history: previous });
          if (owner === revision) messages.push({ role: 'assistant', text: result.answer, sources: result.sources });
        } catch (failure) { if (owner === revision) { messages.pop(); input.value = question; error = failure.message; } }
        finally { pending = false; paint(); }
      };
      document.querySelectorAll('[data-assistant-prompt]').forEach((button) => button.onclick = () => { input.value = button.dataset.assistantPrompt; form.requestSubmit(); });
      paint();
      try {
        const status = await api('ai.status');
        ready = status.enabled === true;
        if (!form.isConnected) return;
        document.querySelector('#assistant-availability').textContent = ready ? 'جاهز لمساعدتك · الإجابات تستند إلى بيانات مِعيار المنشورة.' : 'مساعد مِعيار قيد التجهيز. سيُتاح بعد اكتمال ربط خدمة الذكاء الاصطناعي.';
      } catch { ready = false; if (form.isConnected) document.querySelector('#assistant-availability').textContent = 'تعذّر التحقق من توفر المساعد. حدّث الصفحة وحاول مجددًا.'; }
      if (form.isConnected) paint();
    },
  };
}
