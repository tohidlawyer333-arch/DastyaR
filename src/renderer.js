const $ = (selector, root) => (root || document).querySelector(selector);
const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

let state = null;
let currentView = 'dashboard';
let activeClientId = null;
let activeCaseId = null;
let currentTemplateId = null;
let toastTimer = null;
let providerState = { provider: 'gemini', model: 'gemini-2.5-flash', configured: false };
let creatingVault = false;
let recorder = null;
let recorderChunks = [];
let lastPermissionRequest = null;
let activeResponseElement = null;
const titles = {
  dashboard: ['دفتر وکالت', 'نمای کلی'], clients: ['سامانهٔ موکلین', 'موکلین و پرونده‌ها'],
  templates: ['تولید اسناد', 'قالب‌های آماده'], legal: ['کتابخانهٔ حقوقی', 'مستندات قانونی'],
  agent: ['موتور عامل‌محور Goose', 'دستیار دفتر وکالت'], portal: ['مرورگر داخلی', 'ثنا و عدل ایران'],
  meetings: ['صورت‌جلسه و مکالمه', 'ضبط جلسات'], settings: ['کنترل و پیکربندی', 'تنظیمات و مجوزها']
};
const providerOptions = [
  { id: 'gemini', label: 'Google Gemini', model: 'gemini-2.5-flash', url: 'https://aistudio.google.com/apikey', needsKey: true },
  { id: 'openrouter', label: 'OpenRouter', model: '', url: 'https://openrouter.ai/keys', needsKey: true },
  { id: 'openai', label: 'OpenAI API', model: '', url: 'https://platform.openai.com/api-keys', needsKey: true },
  { id: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat', url: 'https://platform.deepseek.com/api_keys', needsKey: true },
  { id: 'huggingface', label: 'Hugging Face', model: '', url: 'https://huggingface.co/settings/tokens', needsKey: true },
  { id: 'codex', label: 'ChatGPT / Codex با ورود رسمی', model: 'gpt-5.5', url: 'https://chatgpt.com/codex', needsKey: false }
];
function newId() { return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); }
function esc(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function showToast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 4500);
}
function setStatus(message) { $('#app-status').textContent = message; }
function dateFa(value) { if (!value) return '—'; try { return new Date(value).toLocaleDateString('fa-IR'); } catch (_) { return String(value); } }
async function saveState() { await window.dastyar.saveVault(state); }
async function refreshState() { const result = await window.dastyar.getVault(); state = result.data; return state; }
function getClient(clientId) { return (state.clients || []).find((item) => item.id === clientId); }
function getCase(clientId, caseId) { const client = getClient(clientId); return client && Array.isArray(client.cases) ? client.cases.find((item) => item.id === caseId) : null; }
function setActiveView(view) {
  if (!titles[view]) return;
  currentView = view;
  $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $('#view-eyebrow').textContent = titles[view][0]; $('#view-title').textContent = titles[view][1]; renderView();
}
function renderView() {
  if (!state) return;
  const renderers = { dashboard: renderDashboard, clients: renderClients, templates: renderTemplates, legal: renderLegal, agent: renderAgent, portal: renderPortal, meetings: renderMeetings, settings: renderSettings };
  $('#view-content').innerHTML = (renderers[currentView] || renderDashboard)();
  bindViewEvents();
}
function statCard(label, num, note) { return '<article class="stat-card"><div class="stat-label">' + esc(label) + '</div><div class="stat-number">' + esc(num) + '</div><div class="stat-note">' + esc(note) + '</div></article>'; }
function quickLink(number, title, text, view) { return '<button class="list-card" data-view-link="' + esc(view) + '"><div><strong>' + esc(title) + '</strong><small>' + esc(text) + '</small></div><span class="source-badge">' + esc(number) + '</span></button>'; }
function renderDashboard() {
  const cases = state.clients.reduce((sum, client) => sum + ((client.cases || []).length), 0);
  return '<div class="page-heading"><div><h2>خلاصهٔ وضعیت دفتر</h2><p>اطلاعات این صفحه از خزانهٔ محلی همین رایانه خوانده می‌شود.</p></div><div class="actions"><button class="primary" data-action="add-client">ثبت موکل جدید</button><button data-action="open-agent">گفت‌وگو با دستیار</button></div></div>' +
    '<div class="card-grid">' + statCard('موکلین ثبت‌شده', state.clients.length, 'اطلاعات پایه و سابقهٔ کاری') + statCard('پرونده‌های ثبت‌شده', cases, 'ثبت اولیه در اکوسیستم موکلین') + statCard('قالب‌های آماده', state.templates.length, 'قالب‌های قابل انتخاب برای تولید سند') + statCard('فایل‌های رمزگذاری‌شده', state.files.length, 'فایل‌های واردشده به خزانه') + statCard('مستندات حقوقی', state.legalSources.length, 'پیوندها و منابع ثبت‌شده') + statCard('ضبط‌های جلسه', state.recordings.length, 'وضعیت متن‌نگاری جداگانه پیگیری می‌شود') + '</div>' +
    '<section class="panel"><h3>شروع سریع</h3><div class="list">' + quickLink('۱', 'ایجاد پرونده برای موکل', 'موکل را ثبت کنید و شماره پرونده، شعبه، بایگانی و ردیف فرعی را اضافه کنید.', 'clients') + quickLink('۲', 'ساخت قالب حقوقی', 'قالب را با نشانگرهایی مانند {{نام_موکل}} تعریف کنید تا فرم متغیرهایش ساخته شود.', 'templates') + quickLink('۳', 'واردکردن مستندات قانونی', 'پیوند منبع یا فایل مرتبط را در کتابخانهٔ حقوقی ثبت کنید.', 'legal') + quickLink('۴', 'راه‌اندازی دستیار', 'ارائه‌دهنده، مدل و حالت تأیید ابزارها را مشخص کنید.', 'settings') + '</div></section>' +
    '<section class="panel"><h3>یادآوری امنیتی</h3><div class="note warn-note">این نسخهٔ آغازین برای آزمون معماری است. پیش از انتقال اطلاعات واقعی موکلان، نسخهٔ پشتیبان آفلاین تهیه و کنترل‌های امنیتی/آزمون‌های تکمیلی را بررسی کنید. هیچ لایحه‌ای به‌صورت خودکار ارسال نمی‌شود.</div></section>';
}
function renderClients() {
  let html = '<div class="page-heading"><div><h2>اکوسیستم موکلین</h2><p>هر موکل بخش مستقل دارد؛ اطلاعات پرونده‌ها و فایل‌ها جداگانه نگهداری می‌شوند.</p></div><div class="actions"><button class="primary" data-action="add-client">ثبت موکل</button><button data-action="import-client-file">افزودن سند به موکل انتخاب‌شده</button><button data-action="import-client-folder">واردکردن یک پوشهٔ کامل</button></div></div>';
  if (!state.clients.length) return html + '<div class="empty-state">هنوز موکلی ثبت نشده است.<br><button class="primary" data-action="add-client">ثبت اولین موکل</button></div>';
  html += '<div class="list">';
  state.clients.forEach((client) => {
    const selected = activeClientId === client.id;
    html += '<article class="list-card"><div><strong>' + esc(client.name) + '</strong><small>شناسه: ' + esc(client.nationalId || 'ثبت نشده') + ' · پرونده‌ها: ' + esc((client.cases || []).length) + ' · ثبت: ' + esc(dateFa(client.createdAt)) + '</small></div><div class="actions"><button data-action="view-client" data-id="' + esc(client.id) + '">' + (selected ? 'انتخاب شده' : 'مشاهده') + '</button><button data-action="add-case" data-id="' + esc(client.id) + '">افزودن پرونده</button><button data-action="import-for-client" data-id="' + esc(client.id) + '">واردکردن اسناد</button><button data-action="import-folder-for-client" data-id="' + esc(client.id) + '">واردکردن پوشه</button></div></article>';
    if (selected) {
      html += '<section class="panel"><h3>پرونده‌های ' + esc(client.name) + '</h3>';
      if (!(client.cases || []).length) html += '<div class="empty-state">پرونده‌ای ثبت نشده است.</div>';
      else {
        html += '<div class="list">';
        client.cases.forEach((matter) => {
          html += '<div class="list-card"><div><strong>' + esc(matter.title || 'پروندهٔ بدون عنوان') + '</strong><small>شماره پرونده: ' + esc(matter.caseNumber || '—') + ' · بایگانی: ' + esc(matter.archiveNumber || '—') + ' · شعبه: ' + esc(matter.branch || '—') + ' · ردیف فرعی: ' + esc(matter.subRow || '—') + '</small><small>' + esc(matter.notes || '') + '</small></div><div class="actions"><button data-action="select-case" data-client="' + esc(client.id) + '" data-case="' + esc(matter.id) + '">' + (activeCaseId === matter.id ? 'پرونده فعال' : 'انتخاب پرونده') + '</button><button data-action="import-for-case" data-client="' + esc(client.id) + '" data-case="' + esc(matter.id) + '">افزودن سند</button></div></div>';
        });
        html += '</div>';
      }
      const related = state.files.filter((file) => file.clientId === client.id);
      html += '<h3 style="margin-top:22px">اسناد ثبت‌شده (' + related.length + ')</h3>';
      if (related.length) { html += '<div class="list">'; related.forEach((file) => { html += fileRow(file); }); html += '</div>'; }
      else html += '<p class="muted">سندی برای این موکل وارد نشده است.</p>';
      html += '</section>';
    }
  });
  return html + '</div><div class="panel"><div class="note">استخراج خودکار مشخصات پرونده‌ها از ثنا هنوز پیاده‌سازی نشده است. در این نسخه می‌توانید مشخصات را دستی ثبت کنید و مرورگر داخلی را برای بررسی باز کنید.</div></div>';
}
function fileRow(file) {
  return '<article class="list-card"><div><strong>' + esc(file.fileName) + '</strong><small>' + esc(file.category || 'سند') + ' · ' + esc(Math.max(1, Math.round((file.size || 0) / 1024))) + ' کیلوبایت · ' + esc(dateFa(file.importedAt)) + '</small></div><button data-action="export-file" data-id="' + esc(file.id) + '">صادرکردن نسخهٔ رمزگشایی‌شده</button></article>';
}
function varsInTemplate(body) { const matches = String(body || '').match(/\{\{[^}]+\}\}/g) || []; return Array.from(new Set(matches.map((item) => item.slice(2, -2).trim()))); }
function renderTemplates() {
  let html = '<div class="page-heading"><div><h2>قالب‌های آماده</h2><p>جای متغیرها را با {{نام_متغیر}} مشخص کنید؛ فرم متناسب با آن‌ها ساخته می‌شود.</p></div></div>';
  html += '<div class="template-grid"><section class="panel"><h3>ایجاد قالب جدید</h3><form id="template-form"><label>عنوان قالب</label><input name="title" required placeholder="مثلاً دادخواست مطالبه وجه"><label>متن قالب</label><textarea name="body" required placeholder="ریاست محترم ...\nاینجانب {{نام_خواهان}} ..."></textarea><div class="form-actions"><button type="submit" class="primary">ذخیرهٔ قالب</button><button type="button" data-action="auto-template-help">راهنمای متغیرها</button></div></form><div class="note" style="margin-top:14px">نسخهٔ اولیه از نشانگرهای صریح پشتیبانی می‌کند. تحلیل خودکار قالب‌های Word/PDF و تشخیص هوشمند بندهای متغیر در مرحلهٔ بعد به عامل اضافه می‌شود.</div></section>';
  html += '<section class="panel"><h3>استفاده از قالب</h3>';
  if (!state.templates.length) html += '<div class="empty-state">قالبی ثبت نشده است. ابتدا قالب جدید بسازید.</div>';
  else {
    const selected = state.templates.find((item) => item.id === currentTemplateId) || state.templates[0]; currentTemplateId = selected.id;
    html += '<div class="template-grid" style="grid-template-columns:.8fr 1.2fr"><div class="list">';
    state.templates.forEach((template) => { html += '<div class="template-item"><label><input type="checkbox" data-action="choose-template" data-id="' + esc(template.id) + '" ' + (currentTemplateId === template.id ? 'checked' : '') + '> <span><strong>' + esc(template.title) + '</strong><small>' + esc(dateFa(template.createdAt)) + '</small></span></label><button class="secondary" style="margin-top:9px" data-action="delete-template" data-id="' + esc(template.id) + '">حذف قالب</button></div>'; });
    html += '</div><div id="template-fields">' + templateUseForm(selected) + '</div></div>';
  }
  return html + '</section></div>';
}
function templateUseForm(template) {
  let html = '<h3>' + esc(template.title) + '</h3><form id="use-template-form" data-id="' + esc(template.id) + '">';
  const vars = varsInTemplate(template.body);
  if (!vars.length) html += '<div class="note">برای این قالب، متغیری با قالب {{نام_متغیر}} شناسایی نشد.</div>';
  vars.forEach((variable) => { html += '<label>' + esc(variable.replace(/_/g, ' ')) + '</label><input name="var:' + esc(variable) + '" data-variable="' + esc(variable) + '" placeholder="مقدار ' + esc(variable.replace(/_/g, ' ')) + '">'; });
  return html + '<div class="form-actions"><button type="submit" class="primary">تولید پیش‌نویس</button></div></form><label>پیش‌نویس قابل ویرایش</label><textarea id="draft-output" placeholder="پس از تکمیل فرم، پیش‌نویس اینجا نمایش داده می‌شود."></textarea><div class="form-actions"><button data-action="save-draft" class="primary">ذخیره پیش‌نویس</button><button data-action="copy-draft">کپی متن</button></div>';
}
function renderLegal() {
  let html = '<div class="page-heading"><div><h2>ورود مستندات قانونی</h2><p>منابع را در دسته‌بندی دلخواه ثبت کنید و فایل PDF یا دیگر فایل‌ها را به خزانه وارد کنید.</p></div><div class="actions"><button class="primary" data-action="import-legal-file">واردکردن فایل مستند</button><button data-action="open-legal-search">جست‌وجوی اینترنتی</button></div></div>';
  html += '<section class="panel"><h3>ثبت پیوند منبع</h3><form id="legal-form" class="form-grid"><div><label>عنوان / نام منبع</label><input name="title" required placeholder="مثلاً قانون آیین دادرسی مدنی"></div><div><label>دسته‌بندی</label><input name="category" required placeholder="مثلاً قوانین شکلی"></div><div class="wide"><label>نشانی صفحهٔ اینترنتی</label><input name="url" type="url" required placeholder="https://..."></div><div class="wide"><label>یادداشت وکیل</label><textarea name="notes" placeholder="اعتبار، تاریخ، مواد مهم، نحوهٔ استفاده..."></textarea></div><div class="wide"><div class="note warn-note">ثبت پیوند به معنی واکشی یا راستی‌آزمایی خودکار محتوای آن نیست. واکشی امن وب، استخراج متن، دسته‌بندی هوشمند و استناددهی در فاز بعدی اضافه می‌شود.</div></div><div class="wide form-actions"><button type="submit" class="primary">ثبت منبع</button></div></form></section>';
  html += '<section class="panel"><h3>کتابخانهٔ مستندات</h3>';
  const allFiles = state.files.filter((file) => !file.clientId);
  if (!state.legalSources.length && !allFiles.length) html += '<div class="empty-state">منبعی ثبت نشده است.</div>';
  else {
    html += '<div class="list">';
    state.legalSources.forEach((source) => { html += '<article class="list-card"><div><strong>' + esc(source.title) + '</strong><small>' + esc(source.category) + ' · ' + esc(source.url) + '</small><small>' + esc(source.notes || '') + '</small></div><div class="actions"><button data-action="open-source" data-id="' + esc(source.id) + '">بازکردن منبع</button><button data-action="delete-source" data-id="' + esc(source.id) + '">حذف</button></div></article>'; });
    allFiles.forEach((file) => { html += fileRow(file); }); html += '</div>';
  }
  return html + '</section>';
}
function renderAgent() {
  return '<div class="page-heading"><div><h2>دستیار دفتر وکالت</h2><p>عامل Goose درخواست را اجرا می‌کند؛ مجوز ابزارها به حالت انتخاب‌شده وابسته است.</p></div><div class="actions"><button data-action="agent-stop" class="danger">توقف عامل</button><button data-action="go-settings">تنظیم ارائه‌دهنده</button></div></div>' +
    '<div class="agent-layout"><section class="panel"><h3>گفت‌وگو</h3><div id="agent-log" class="chat-log"><div class="chat-message assistant"><span class="message-label">دستیار دفتر وکالت</span><div class="message-body">درخواست خود را وارد کنید. در این نسخهٔ آغازین، اتصال زنده به Goose باید روی دستگاه/ساخت بررسی شود.</div></div></div><label for="agent-prompt">دستور به دستیار</label><textarea id="agent-prompt" class="chat-input" placeholder="مثلاً پروندهٔ انتخاب‌شده را تحلیل کن و ایرادهای شکلی و ماهوی را با ذکر منابع قابل بررسی دسته‌بندی کن."></textarea><div class="form-actions"><button class="primary" data-action="agent-send">ارسال درخواست</button><button data-action="agent-clear">پاک‌کردن نمایش</button></div></section>' +
    '<section class="panel"><h3>زمینهٔ جاری</h3><div class="note">زمینهٔ موکل/پرونده به دستور ارسال می‌شود. دسترسی خواندن اسناد رمزگذاری‌شده به محیط عامل و جداسازی کامل workspace هر پرونده هنوز نیازمند تکمیل است.</div><div class="form-grid"><div><label>موکل فعال</label><input readonly value="' + esc(getClient(activeClientId)?.name || 'انتخاب نشده') + '"></div><div><label>پروندهٔ فعال</label><input readonly value="' + esc(getCase(activeClientId, activeCaseId)?.title || 'انتخاب نشده') + '"></div><div class="wide"><label>ارائه‌دهنده</label><input readonly value="' + esc((providerOptions.find((item) => item.id === providerState.provider) || {}).label || providerState.provider) + '"></div><div class="wide"><label>مدل</label><input readonly value="' + esc(providerState.model || 'تعریف نشده') + '"></div></div><p class="muted">ثبت، ارسال یا امضای نهایی هر سند حقوقی باید تأیید صریح وکیل داشته باشد.</p></section></div>';
}
function renderPortal() {
  return '<div class="page-heading"><div><h2>ورود به عدل ایران</h2><p>مرورگر داخلی در پنجره‌ای جدا با پارتیشن اختصاصی کوکی باز می‌شود.</p></div></div><section class="panel"><h3>ابلاغیه‌ها و اطلاع‌رسانی پرونده برای وکلا</h3><p>از مرورگر داخلی وارد حساب رسمی شوید. این نسخه صفحه را باز می‌کند اما هنوز استخراج تمام پرونده‌ها/ابلاغیه‌ها و همگام‌سازی آن‌ها را پیاده‌سازی نکرده است.</p><div class="note warn-note">بازکردن ابلاغیه می‌تواند آثار حقوقی داشته باشد. قبل از عملیات تغییر وضعیت، عملکرد سامانه را بررسی کنید. اجرای خودکار اقدام قضایی یا ارسال نهایی فعال نیست.</div><div class="form-actions"><button class="primary" data-action="open-portal">بازکردن مرورگر داخلی عدل ایران</button><button data-action="go-clients">بازگشت به موکلین</button></div><div class="note" style="margin-top:16px">کوکی‌ها داخل پارتیشن محلی مرورگر این برنامه نگهداری می‌شوند. این نسخه کوکی یا رمز ورود را استخراج یا به سرور دیگری ارسال نمی‌کند.</div></section>';
}
function renderMeetings() {
  const clients = state.clients.map((client) => '<option value="' + esc(client.id) + '" ' + (activeClientId === client.id ? 'selected' : '') + '>' + esc(client.name) + '</option>').join('');
  const cases = (getClient(activeClientId)?.cases || []).map((matter) => '<option value="' + esc(matter.id) + '" ' + (activeCaseId === matter.id ? 'selected' : '') + '>' + esc(matter.title) + '</option>').join('');
  let html = '<div class="page-heading"><div><h2>ضبط مکالمهٔ جلسه</h2><p>ضبط در دستگاه انجام و فایل داخل خزانه رمزگذاری می‌شود.</p></div></div><section class="panel"><h3>جلسهٔ جدید</h3><div class="form-grid"><div><label>موکل</label><select id="record-client"><option value="">انتخاب موکل</option>' + clients + '</select></div><div><label>پرونده</label><select id="record-case"><option value="">انتخاب پرونده</option>' + cases + '</select></div></div><div class="form-actions"><button class="primary" id="record-start">شروع ضبط</button><button class="danger" id="record-stop" disabled>توقف و ذخیره</button><span id="record-status" class="status-pill">آمادهٔ ضبط</span></div><div class="note warn-note" style="margin-top:15px">قبل از ضبط، رضایت اشخاص و قواعد قانونی را بررسی کنید. این نسخه صدا را ذخیره می‌کند؛ تبدیل خودکار گفتار فارسی/ترکی ارومیه‌ای به متن و ترجمهٔ هم‌زمان هنوز اضافه نشده است و دقت بدون خطا قابل تضمین نیست.</div></section><section class="panel"><h3>ضبط‌های ثبت‌شده</h3>';
  if (!state.recordings.length) html += '<div class="empty-state">ضبطی ثبت نشده است.</div>';
  else { html += '<div class="list">'; state.recordings.forEach((recording) => { const file = state.files.find((item) => item.id === recording.fileId); html += '<article class="list-card"><div><strong>' + esc(file?.fileName || 'ضبط جلسه') + '</strong><small>' + esc(dateFa(recording.createdAt)) + ' · ' + esc(recording.status === 'recorded-not-transcribed' ? 'ضبط شده؛ متن‌نگاری نشده' : recording.status) + '</small></div><button data-action="export-file" data-id="' + esc(recording.fileId) + '">صادرکردن فایل صوتی</button></article>'; }); html += '</div>'; }
  return html + '</section>';
}
function renderSettings() {
  const options = providerOptions.map((item) => '<option value="' + esc(item.id) + '" ' + (providerState.provider === item.id ? 'selected' : '') + '>' + esc(item.label) + '</option>').join('');
  const mode = state.settings.permissionMode || 'manual';
  return '<div class="page-heading"><div><h2>تنظیمات دستیار</h2><p>مدل، کلید، حالت اختیار عامل و محل داده‌ها.</p></div><div class="actions"><button data-action="reveal-data">نمایش پوشهٔ داده‌ها</button></div></div>' +
    '<div class="agent-layout"><section class="panel"><h3>اتصال مدل</h3><form id="provider-form"><label>ارائه‌دهنده</label><select id="provider-select" name="provider">' + options + '</select><label>شناسهٔ مدل</label><input id="model-name" name="model" value="' + esc(providerState.model || '') + '" placeholder="نام دقیق مدل در Goose"><div id="api-key-group"><label>کلید API یا Token</label><input id="api-key" name="apiKey" type="password" autocomplete="off" placeholder="' + (providerState.configured ? 'کلید ذخیره شده؛ برای تغییر مقدار جدید وارد کنید' : 'کلید را از سایت رسمی دریافت کنید') + '"></div><div class="form-actions"><button type="submit" class="primary">ذخیرهٔ اتصال</button><button type="button" data-action="provider-key-page">رفتن به صفحهٔ رسمی کلید</button></div><p class="muted" id="provider-info"></p><div class="note">کلید با قابلیت امن سیستم‌عامل ذخیره می‌شود و در مخزن یا خزانه قرار نمی‌گیرد. دریافت کلید نیازمند حساب و تأیید وکیل است؛ این برنامه کلید را با دورزدن کنترل‌های سرویس استخراج نمی‌کند.</div></form></section>' +
    '<section class="panel"><h3>سطح اختیار عامل</h3><label for="permission-mode">حالت اجرا</label><select id="permission-mode"><option value="manual" ' + (mode === 'manual' ? 'selected' : '') + '>دسترسی کامل با تأیید وکیل برای هر گام</option><option value="balanced" ' + (mode === 'balanced' ? 'selected' : '') + '>متعادل؛ تأیید برای گام‌های پرخطر</option><option value="autonomous" ' + (mode === 'autonomous' ? 'selected' : '') + '>نیمه‌خودکار؛ فقط وظایف کم‌خطر</option></select><div class="note warn-note" style="margin-top:14px">حالت دستی، Goose را با حالت تأیید ابزارها اجرا می‌کند. این حالت جایگزین آزمون مستقل همهٔ افزونه‌های MCP و گیت‌های اقدام حقوقی نیست.</div><div class="form-actions"><button class="primary" data-action="save-permissions">ذخیرهٔ سطح دسترسی</button><button data-action="provider-status">بررسی وضعیت موتور</button></div><div id="engine-details" class="note" style="margin-top:14px">بررسی موتور پس از اجرای ساخت ویندوز تکمیل می‌شود.</div></section></div>' +
    '<section class="panel"><h3>ابزارها و افزونه‌های Goose</h3><p>موتور Goose در همین برنامه و بدون بازشدن رابط دسکتاپ دیگری اجرا می‌شود. قابلیت‌های داخلی مانند مدیریت افزونه‌ها، مهارت‌ها و تفویض وظایف، وابسته به نسخه و پیکربندی موتورند.</p>' +
    '<div class="form-grid"><div><label><input type="checkbox" data-builtin-extension="developer" ' + ((state.settings.builtinMcpExtensions || ['developer']).includes('developer') ? 'checked' : '') + '> ابزار توسعه‌دهنده (فایل/ترمینال)</label><small class="muted">این ابزار می‌تواند فرمان اجرا کند؛ فقط با مجوزهای بررسی‌شده فعالش کنید.</small></div><div><label><input type="checkbox" data-builtin-extension="memory" ' + ((state.settings.builtinMcpExtensions || ['developer']).includes('memory') ? 'checked' : '') + '> حافظهٔ Goose</label><small class="muted">حافظه می‌تواند اطلاعات را میان نشست‌ها نگه دارد. برای محرمانگی پرونده، به‌صورت پیش‌فرض خاموش است.</small></div></div>' +
    '<label for="mcp-config">پیکربندی افزونه‌های MCP (JSON؛ می‌توانید stdio، http یا sse تعریف کنید)</label><textarea id="mcp-config" class="chat-input" spellcheck="false">' + esc(JSON.stringify(state.settings.mcpServers || [], null, 2)) + '</textarea>' +
    '<div class="note warn-note">برای stdio از name/command/args/env و برای http یا sse از type/name/url/headers استفاده کنید. هر افزونهٔ خارجی می‌تواند کد اجرا کند، به شبکه دسترسی داشته باشد یا داده را به بیرون بفرستد. فقط افزونه‌هایی را فعال کنید که منبع و مجوزهایشان را بررسی کرده‌اید. کلیدها و مقادیر محرمانه در این JSON داخل خزانهٔ رمزگذاری‌شده نگهداری می‌شوند؛ آن‌ها را در گزارش یا فایل مخزن قرار ندهید.</div>' +
    '<div class="form-actions"><button class="primary" data-action="save-mcp-settings">ذخیرهٔ ابزارها و افزونه‌ها</button></div></section>' +
    '<section class="panel"><h3>حریم خصوصی و پشتیبان</h3><p>اطلاعات خزانه با AES-256-GCM رمزگذاری و کلید از گذرواژه مشتق می‌شود. فایل‌ها جداگانه رمزگذاری می‌شوند. خروجی فایل، نسخهٔ رمزگشایی‌شده تولید می‌کند و فقط باید در محل مورداعتماد ذخیره شود. قابلیت پشتیبان و بازیابی کامل هنوز باید تکمیل و آزمون شود.</p><div class="form-actions"><button data-action="reveal-data">بازکردن پوشهٔ داده‌ها</button><button class="danger" data-action="lock-vault">قفل‌کردن خزانه</button></div></section>';
}
function bindViewEvents() {
  $$('.nav-item[data-view]').forEach((button) => button.addEventListener('click', () => setActiveView(button.dataset.view)));
  $$('[data-view-link]').forEach((button) => button.addEventListener('click', () => setActiveView(button.dataset.viewLink)));
  $$('[data-action]').forEach((button) => {
    if (button.tagName === 'INPUT' && button.type === 'checkbox') { button.addEventListener('change', () => { currentTemplateId = button.dataset.id; renderView(); }); return; }
    button.addEventListener('click', () => handleAction(button.dataset.action, button));
  });
  const templateForm = $('#template-form');
  if (templateForm) templateForm.addEventListener('submit', (event) => { event.preventDefault(); addTemplate(new FormData(templateForm)); });
  const useForm = $('#use-template-form');
  if (useForm) useForm.addEventListener('submit', (event) => {
    event.preventDefault(); const template = state.templates.find((item) => item.id === useForm.dataset.id); if (!template) return;
    let output = template.body;
    varsInTemplate(output).forEach((variable) => {
      const input = $('[data-variable="' + CSS.escape(variable) + '"]', useForm); const value = input ? input.value : '';
      const escaped = variable.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
      output = output.replace(new RegExp('\\{\\{' + escaped + '\\}\\}', 'g'), value || '[تکمیل نشده: ' + variable + ']');
    });
    $('#draft-output').value = output;
  });
  const legalForm = $('#legal-form');
  if (legalForm) legalForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(legalForm);
    state.legalSources.push({ id: newId(), title: String(form.get('title')).trim(), category: String(form.get('category')).trim(), url: String(form.get('url')).trim(), notes: String(form.get('notes') || '').trim(), createdAt: new Date().toISOString() });
    await saveState(); renderView(); showToast('منبع ثبت شد.');
  });
  const providerForm = $('#provider-form');
  if (providerForm) providerForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(providerForm);
    try { providerState = await window.dastyar.saveProvider({ provider: form.get('provider'), model: form.get('model'), apiKey: form.get('apiKey') }); showToast('تنظیمات ارائه‌دهنده ذخیره شد.'); renderView(); }
    catch (error) { showToast(error.message); }
  });
  const providerSelect = $('#provider-select');
  if (providerSelect) providerSelect.addEventListener('change', updateProviderForm);
  const permissionMode = $('#permission-mode');
  if (permissionMode) permissionMode.addEventListener('change', () => { state.settings.permissionMode = permissionMode.value; });
  const recordClient = $('#record-client');
  if (recordClient) recordClient.addEventListener('change', () => { activeClientId = recordClient.value || null; activeCaseId = null; renderView(); });
  const recordStart = $('#record-start'); if (recordStart) recordStart.addEventListener('click', startRecording);
  const recordStop = $('#record-stop'); if (recordStop) recordStop.addEventListener('click', stopRecording);
}
function updateProviderForm() {
  const selected = providerOptions.find((item) => item.id === $('#provider-select').value) || providerOptions[0];
  $('#api-key-group').classList.toggle('hidden', !selected.needsKey);
  if (!$('#model-name').value.trim() && selected.model) $('#model-name').value = selected.model;
  $('#provider-info').textContent = selected.needsKey ? 'کلید موردنیاز: ' + selected.id + '؛ کلید را فقط از صفحهٔ رسمی دریافت کنید.' : 'گزینهٔ Codex به ورود رسمی و سازگاری ابزار/اشتراک نیاز دارد؛ اتصال آن هنوز باید در محیط هدف آزموده شود.';
}
async function handleAction(action, button) {
  try {
    switch (action) {
      case 'add-client': showAddClientForm(); break;
      case 'cancel-client': $('#new-client-panel')?.remove(); break;
      case 'view-client': activeClientId = button.dataset.id; activeCaseId = null; renderView(); break;
      case 'add-case': await addCase(button.dataset.id); break;
      case 'select-case': activeClientId = button.dataset.client; activeCaseId = button.dataset.case; renderView(); break;
      case 'import-client-file': await importFiles({ clientId: activeClientId, caseId: activeCaseId, category: 'پروندهٔ موکل' }); break;
      case 'import-client-folder': if (!activeClientId) return showToast('ابتدا یک موکل را انتخاب کنید.'); await importFolder({ clientId: activeClientId, caseId: activeCaseId, category: 'پروندهٔ موکل' }); break;
      case 'import-folder-for-client': activeClientId = button.dataset.id; activeCaseId = null; await importFolder({ clientId: activeClientId, category: 'پروندهٔ موکل' }); break;
      case 'import-for-client': activeClientId = button.dataset.id; activeCaseId = null; await importFiles({ clientId: activeClientId, category: 'پروندهٔ موکل' }); break;
      case 'import-for-case': activeClientId = button.dataset.client; activeCaseId = button.dataset.case; await importFiles({ clientId: activeClientId, caseId: activeCaseId, category: 'پروندهٔ موکل' }); break;
      case 'export-file': { const result = await window.dastyar.exportFile(button.dataset.id); if (!result.canceled) showToast('فایل در محل انتخاب‌شده صادر شد.'); break; }
      case 'auto-template-help': showToast('برای هر متغیر از نوشتار دقیق {{نام_متغیر}} استفاده کنید؛ مانند {{شماره_پرونده}}.'); break;
      case 'choose-template': currentTemplateId = button.dataset.id; renderView(); break;
      case 'delete-template': if (confirm('قالب انتخاب‌شده حذف شود؟')) { state.templates = state.templates.filter((item) => item.id !== button.dataset.id); if (currentTemplateId === button.dataset.id) currentTemplateId = null; await saveState(); renderView(); } break;
      case 'save-draft': { const output = $('#draft-output'); if (!output || !output.value.trim()) return showToast('ابتدا پیش‌نویس را تولید کنید.'); state.drafts.push({ id: newId(), templateId: currentTemplateId, title: (state.templates.find((item) => item.id === currentTemplateId) || {}).title || 'پیش‌نویس', body: output.value, createdAt: new Date().toISOString(), status: 'draft-awaiting-attorney-review' }); await saveState(); showToast('پیش‌نویس ذخیره شد.'); break; }
      case 'copy-draft': { const output = $('#draft-output'); if (output) { await navigator.clipboard.writeText(output.value); showToast('متن پیش‌نویس کپی شد.'); } break; }
      case 'import-legal-file': await importFiles({ category: 'مستندات قانونی' }); break;
      case 'open-legal-search': await window.dastyar.openExternal('https://www.google.com/search?q=%D9%82%D9%88%D8%A7%D9%86%DB%8C%D9%86+%D9%88+%D9%85%D9%82%D8%B1%D8%B1%D8%A7%D8%AA+%D8%A7%DB%8C%D8%B1%D8%A7%D9%86'); break;
      case 'open-source': { const source = state.legalSources.find((item) => item.id === button.dataset.id); if (source) await window.dastyar.openExternal(source.url); break; }
      case 'delete-source': if (confirm('منبع از فهرست حذف شود؟ فایل پیوست حذف نمی‌شود.')) { state.legalSources = state.legalSources.filter((item) => item.id !== button.dataset.id); await saveState(); renderView(); } break;
      case 'open-agent': setActiveView('agent'); break;
      case 'agent-send': await sendAgent(); break;
      case 'agent-stop': await window.dastyar.stopAgent(); setStatus('عامل متوقف شد'); break;
      case 'agent-clear': $('#agent-log').innerHTML = ''; activeResponseElement = null; break;
      case 'go-settings': setActiveView('settings'); break;
      case 'go-clients': setActiveView('clients'); break;
      case 'open-portal': await window.dastyar.openPortal(); showToast('مرورگر داخلی عدل ایران باز شد.'); break;
      case 'save-mcp-settings': {
        let servers;
        try { servers = JSON.parse($('#mcp-config').value || '[]'); } catch (_) { throw new Error('JSON افزونه‌ها معتبر نیست.'); }
        if (!Array.isArray(servers)) throw new Error('پیکربندی افزونه‌ها باید یک آرایهٔ JSON باشد.');
        servers = servers.map((server, index) => {
          if (!server || typeof server !== 'object' || !String(server.name || '').trim()) throw new Error('افزونهٔ شمارهٔ ' + (index + 1) + ' باید name داشته باشد.');
          const type = String(server.type || 'stdio').toLowerCase();
          if (!['stdio', 'http', 'sse'].includes(type)) throw new Error('نوع MCP باید stdio، http یا sse باشد.');
          if (type === 'stdio' && !String(server.command || '').trim()) throw new Error('افزونهٔ stdio شمارهٔ ' + (index + 1) + ' باید command داشته باشد.');
          if ((type === 'http' || type === 'sse') && !String(server.url || '').trim()) throw new Error('افزونهٔ راه دور شمارهٔ ' + (index + 1) + ' باید url داشته باشد.');
          if (server.args !== undefined && !Array.isArray(server.args)) throw new Error('args در افزونهٔ شمارهٔ ' + (index + 1) + ' باید آرایه باشد.');
          if (server.env !== undefined && (server.env === null || typeof server.env !== 'object' || Array.isArray(server.env))) throw new Error('env در افزونهٔ شمارهٔ ' + (index + 1) + ' باید شیء کلید/مقدار باشد.');
          if (server.headers !== undefined && (server.headers === null || typeof server.headers !== 'object' || Array.isArray(server.headers))) throw new Error('headers در افزونهٔ شمارهٔ ' + (index + 1) + ' باید شیء کلید/مقدار باشد.');
          return { name: String(server.name).trim(), type, command: String(server.command || '').trim(), url: String(server.url || '').trim(), args: (server.args || []).map(String), env: server.env || {}, headers: server.headers || {}, enabled: server.enabled !== false };
        });
        const enabledBuiltins = $$('[data-builtin-extension]:checked').map((item) => item.dataset.builtinExtension);
        state.settings.mcpServers = servers;
        state.settings.builtinMcpExtensions = enabledBuiltins;
        await saveState();
        await window.dastyar.stopAgent();
        showToast('تنظیمات ابزارها ذخیره شد. در اجرای بعدی عامل اعمال می‌شود.');
        renderView();
        break;
      }
      case 'provider-key-page': await window.dastyar.openProviderPage($('#provider-select').value); break;
      case 'save-permissions': state.settings.permissionMode = $('#permission-mode').value; await saveState(); showToast('سطح اختیار ذخیره شد.'); break;
      case 'provider-status': { const status = await window.dastyar.vaultStatus(); $('#engine-details').textContent = 'Goose در بسته: ' + (status.gooseAvailable ? 'فایل اجرایی پیدا شد' : 'فایل اجرایی پیدا نشد') + ' · مسیر داده: ' + status.dataPath + ' · ارائه‌دهنده: ' + (providerState.configured ? 'تنظیم شده' : 'نیازمند تنظیم'); break; }
      case 'reveal-data': await window.dastyar.revealData(); break;
      case 'lock-vault': await lockVault(); break;
      default: break;
    }
  } catch (error) { showToast(error.message || String(error)); }
}
function showAddClientForm() {
  const root = $('#view-content');
  if ($('#new-client-form')) { $('#new-client-form').querySelector('input[name="name"]').focus(); return; }
  root.insertAdjacentHTML('afterbegin', '<section class="panel" id="new-client-panel"><h3>ثبت موکل جدید</h3><form id="new-client-form" class="form-grid"><div><label>نام موکل</label><input name="name" required></div><div><label>کد / شناسه موکل (اختیاری)</label><input name="nationalId"></div><div class="wide"><label>اطلاعات تماس / یادداشت</label><textarea name="notes"></textarea></div><div class="wide form-actions"><button type="submit" class="primary">ذخیره موکل</button><button type="button" data-action="cancel-client">انصراف</button></div></form></section>');
  const form = $('#new-client-form');
  form.addEventListener('submit', async (event) => { event.preventDefault(); await addClient(new FormData(form)); });
  $('[data-action="cancel-client"]', form).addEventListener('click', () => $('#new-client-panel')?.remove());
  form.querySelector('input[name="name"]').focus();
}
async function addClient(form) {
  const name = String(form.get('name') || '').trim(); if (!name) return showToast('نام موکل لازم است.');
  const client = { id: newId(), name, nationalId: String(form.get('nationalId') || '').trim(), notes: String(form.get('notes') || '').trim(), createdAt: new Date().toISOString(), cases: [] };
  state.clients.push(client); activeClientId = client.id; await saveState(); setActiveView('clients'); showToast('موکل ثبت شد.');
}
async function addCase(clientId) {
  const client = getClient(clientId); if (!client) return;
  const title = prompt('عنوان پرونده را وارد کنید:', 'پروندهٔ جدید'); if (!title || !title.trim()) return;
  const caseNumber = prompt('شماره پرونده (در صورت وجود):', '') || '';
  const archiveNumber = prompt('شماره بایگانی:', '') || '';
  const branch = prompt('شعبه:', '') || '';
  const subRow = prompt('ردیف فرعی:', '') || '';
  const notes = prompt('موضوع یا توضیحات:', '') || '';
  const matter = { id: newId(), title: title.trim(), caseNumber: caseNumber.trim(), archiveNumber: archiveNumber.trim(), branch: branch.trim(), subRow: subRow.trim(), notes: notes.trim(), createdAt: new Date().toISOString() };
  client.cases.push(matter); activeClientId = clientId; activeCaseId = matter.id; await saveState(); renderView(); showToast('پرونده ثبت شد.');
}
async function addTemplate(form) {
  const title = String(form.get('title') || '').trim(); const body = String(form.get('body') || '').trim(); if (!title || !body) return;
  const template = { id: newId(), title, body, variables: varsInTemplate(body), createdAt: new Date().toISOString() };
  state.templates.push(template); currentTemplateId = template.id; await saveState(); renderView(); showToast('قالب آماده ذخیره شد.');
}
async function importFiles(options) {
  const result = await window.dastyar.importFiles(options || {});
  if (result.files && result.files.length) {
    await refreshState(); setStatus(result.files.length + ' فایل به خزانه افزوده شد'); renderView(); showToast(result.files.length + ' فایل وارد و رمزگذاری شد.');
  }
}
async function importFolder(options) {
  const result = await window.dastyar.importFolder(options || {});
  if (result.files && result.files.length) {
    await refreshState(); setStatus(result.files.length + ' فایل از پوشه افزوده شد'); renderView(); showToast(result.files.length + ' فایل از پوشه وارد و رمزگذاری شد.');
  }
}
function appendChat(label, text, role) {
  const log = $('#agent-log'); if (!log) return null;
  const div = document.createElement('div'); div.className = 'chat-message ' + role;
  const lab = document.createElement('span'); lab.className = 'message-label'; lab.textContent = label;
  const body = document.createElement('div'); body.className = 'message-body'; body.textContent = String(text || '');
  div.appendChild(lab); div.appendChild(body); log.appendChild(div); log.scrollTop = log.scrollHeight; return div;
}
async function sendAgent() {
  const input = $('#agent-prompt'); const request = input && input.value.trim(); if (!request) return showToast('دستور را وارد کنید.');
  input.value = ''; appendChat('وکیل', request, 'user'); activeResponseElement = appendChat('دستیار دفتر وکالت', 'در حال اجرا...', 'assistant'); setStatus('در حال آماده‌سازی عامل Goose...');
  const client = getClient(activeClientId); const matter = getCase(activeClientId, activeCaseId);
  const context = {
    client: client ? { name: client.name, id: client.id, notes: client.notes } : null,
    case: matter || null,
    legalSources: state.legalSources.map((source) => ({ title: source.title, category: source.category, url: source.url })),
    note: 'در نسخهٔ فعلی، فایل‌های رمزگذاری‌شده هنوز به‌طور خودکار در محیط کاری عامل باز نشده‌اند.'
  };
  try {
    const result = await window.dastyar.sendAgentPrompt({ text: request, context });
    setStatus('پاسخ عامل دریافت شد.');
    const content = result.result && result.result.content;
    if (content && !activeResponseElement?.querySelector('.message-body')?.textContent.includes('در حال اجرا')) {
      // Stream updates already filled the response element.
    } else if (content && activeResponseElement) {
      activeResponseElement.querySelector('.message-body').textContent = Array.isArray(content) ? content.map((item) => item.text || '').join('\n') : JSON.stringify(content);
    }
  } catch (error) {
    if (activeResponseElement) activeResponseElement.querySelector('.message-body').textContent = 'خطا: ' + error.message;
    setStatus('اتصال عامل ناموفق بود.');
  }
}
async function startRecording() {
  if (recorder) return;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('ضبط صدا در این محیط پشتیبانی نمی‌شود.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); recorderChunks = []; recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => { if (event.data && event.data.size) recorderChunks.push(event.data); };
    recorder.onstop = async () => {
      try {
        const blob = new Blob(recorderChunks, { type: recorder.mimeType || 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer(); const bytes = Array.from(new Uint8Array(arrayBuffer));
        const clientId = $('#record-client') ? $('#record-client').value : activeClientId; const caseId = $('#record-case') ? $('#record-case').value : activeCaseId;
        const fileName = 'جلسه-' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';
        await window.dastyar.saveRecording({ bytes, mimeType: blob.type, fileName, clientId: clientId || null, caseId: caseId || null });
        await refreshState(); renderView(); setStatus('فایل صوتی رمزگذاری و ذخیره شد.'); showToast('ضبط ذخیره شد. تبدیل خودکار به متن هنوز فعال نیست.');
      } catch (error) { showToast(error.message); }
      stream.getTracks().forEach((track) => track.stop()); recorder = null;
      if ($('#record-start')) $('#record-start').disabled = false;
      if ($('#record-stop')) $('#record-stop').disabled = true;
      if ($('#record-status')) $('#record-status').textContent = 'ضبط ذخیره شد';
    };
    recorder.start(1000); $('#record-start').disabled = true; $('#record-stop').disabled = false; $('#record-status').textContent = 'در حال ضبط...'; setStatus('ضبط صدا فعال است');
  } catch (error) { showToast('دسترسی به میکروفون برقرار نشد: ' + error.message); }
}
function stopRecording() { if (recorder && recorder.state !== 'inactive') recorder.stop(); }
function showPermission(payload) {
  lastPermissionRequest = payload; const params = payload.params || {}; const toolCall = params.toolCall || params.tool || {};
  $('#permission-description').textContent = 'عامل Goose برای ادامهٔ کار درخواست مجوز کرده است. نام ابزار و جزئیات را بررسی کنید و فقط در صورت اطمینان اجازه دهید.';
  $('#permission-details').textContent = JSON.stringify({ toolCall, options: params.options || [] }, null, 2);
  const options = Array.isArray(params.options) ? params.options : []; const root = $('#permission-options'); root.innerHTML = '';
  options.forEach((option) => {
    const button = document.createElement('button'); button.textContent = option.name || option.optionId || 'انتخاب';
    button.className = /allow|accept|approve/i.test(String(option.kind || '') + ' ' + String(option.optionId || '')) ? 'primary' : 'secondary';
    button.addEventListener('click', async () => {
      try { await window.dastyar.answerPermission({ id: payload.id, optionId: option.optionId }); } catch (error) { showToast(error.message); }
      $('#permission-modal').classList.add('hidden'); lastPermissionRequest = null;
    }); root.appendChild(button);
  });
  $('#permission-modal').classList.remove('hidden');
}
async function lockVault() {
  if (recorder) stopRecording(); await window.dastyar.lockVault(); state = null;
  $('#app-shell').classList.add('hidden'); $('#lock-screen').classList.remove('hidden'); $('#lock-hint').textContent = 'خزانه قفل شد. برای ادامه گذرواژه را وارد کنید.';
  $('#lock-submit').textContent = 'باز کردن خزانه'; $('#vault-password').value = ''; $('#vault-confirm').value = ''; $('#vault-password').focus();
}
async function showApp(data) {
  state = data; providerState = await window.dastyar.getProvider();
  $('#lock-screen').classList.add('hidden'); $('#app-shell').classList.remove('hidden');
  const status = await window.dastyar.vaultStatus(); $('#engine-badge').textContent = status.gooseAvailable ? 'Goose موجود؛ اتصال نیازمند آزمون' : 'Goose هنوز نصب نشده'; $('#engine-badge').classList.toggle('ready', status.gooseAvailable);
  setActiveView(currentView);
}
async function initLock() {
  const status = await window.dastyar.vaultStatus(); creatingVault = !status.exists;
  if (creatingVault) { $('#lock-hint').textContent = 'خزانهٔ رمزگذاری‌شده هنوز وجود ندارد. گذرواژهٔ قوی حداقل ۱۲ نویسه‌ای تعیین کنید.'; $('#lock-submit').textContent = 'ساخت خزانهٔ رمزگذاری‌شده'; $('#confirm-label').hidden = false; $('#vault-confirm').hidden = false; $('#vault-password').autocomplete = 'new-password'; }
  else { $('#lock-hint').textContent = 'برای بازکردن خزانه، گذرواژه را وارد کنید.'; $('#lock-submit').textContent = 'باز کردن خزانه'; }
}
$('#lock-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const password = $('#vault-password').value; $('#lock-error').textContent = '';
  try {
    let result;
    if (creatingVault) { if (password !== $('#vault-confirm').value) throw new Error('گذرواژه و تکرار آن یکسان نیستند.'); if (password.length < 12) throw new Error('گذرواژه باید حداقل ۱۲ نویسه داشته باشد.'); result = await window.dastyar.createVault(password); }
    else result = await window.dastyar.unlockVault(password);
    await showApp(result.data); $('#vault-password').value = ''; $('#vault-confirm').value = '';
  } catch (error) { $('#lock-error').textContent = 'خطا: ' + (error.message || 'خزانه باز نشد.'); }
});
$('#navigation').addEventListener('click', (event) => { const button = event.target.closest('[data-view]'); if (button) setActiveView(button.dataset.view); });
$('#lock-now').addEventListener('click', lockVault);
$('#permission-cancel').addEventListener('click', async () => {
  if (!lastPermissionRequest) { $('#permission-modal').classList.add('hidden'); return; }
  const options = Array.isArray(lastPermissionRequest.params?.options) ? lastPermissionRequest.params.options : [];
  const deny = options.find((option) => /reject|deny|cancel/i.test(String(option.kind || '') + ' ' + String(option.optionId || '')));
  if (deny) { try { await window.dastyar.answerPermission({ id: lastPermissionRequest.id, optionId: deny.optionId }); } catch (_) {} }
  $('#permission-modal').classList.add('hidden'); lastPermissionRequest = null;
});
window.dastyar.on('agent:update', (payload) => {
  const update = payload.update || payload; const content = update.content;
  let text = '';
  if (content && typeof content.text === 'string') text = content.text;
  else if (Array.isArray(content)) text = content.map((item) => item.text || '').join('\n');
  else if (typeof update.text === 'string') text = update.text;
  if (text && currentView === 'agent' && activeResponseElement) {
    const body = activeResponseElement.querySelector('.message-body');
    if (body.textContent === 'در حال اجرا...') body.textContent = '';
    body.textContent += text; $('#agent-log').scrollTop = $('#agent-log').scrollHeight;
  } else if (update.sessionUpdate && currentView === 'agent' && activeResponseElement && !text) {
    setStatus('عامل: ' + String(update.sessionUpdate));
  }
  setStatus('عامل در حال اجراست...');
});
window.dastyar.on('agent:status', (payload) => { setStatus(payload.running ? 'عامل Goose فعال است' : 'عامل Goose متوقف است'); if (payload.error) showToast('خطای موتور Goose: ' + payload.error); });
window.dastyar.on('agent:log', (payload) => { if (payload.text) setStatus('گزارش موتور: ' + payload.text.slice(-150)); });
window.dastyar.on('agent:permission-request', showPermission);
initLock();
