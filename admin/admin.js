/* ==========================================================================
   Qiti — تطبيق اللوحة الإدارية
   صفحة وحدة، بلا build، بلا إطار. الراوتينغ بالـ hash، وكل الاتصالات
   تمرّ على فنكشن واحد (/admin-api) اللي يتأكّد من الجلسة قبل كل أكشن.

   ── الفكرة المركزية ──────────────────────────────────────────────────
   الفورم ما يتكتبش بيد حقل بحقل. كل قسم عندو "وصفة" حقول (SECTION_FIELDS)،
   واللوحة تبني منها الـ HTML وحدها. زيد قسم جديد في الرندر؟ زيد وصفتو
   هنا وخلاص — بلا ما تلمس أي كود واجهة آخر.

   ── التعديل بالمسار ──────────────────────────────────────────────────
   كل حقل عندو data-path كيما "sections.3.data.cards.0.title". مستمع
   واحد يكتب القيمة في الحالة بالمسار هذاك. هذا يخلّي عدد المستمعين
   ثابت مهما كبر الفورم، ويخلّي المعاينة تعرف بالضبط واش تبدّل.
   ========================================================================== */
(function () {
  'use strict';

  /* ── ثوابت ──────────────────────────────────────────────────────── */

  /* نفس قائمة sprite.mjs — الأيقونة اللي ماشي فيها ما تتعرضش أصلاً */
  var ICONS = ['i-pin', 'i-zap', 'i-drop', 'i-phone', 'i-globe', 'i-heart', 'i-shield',
    'i-feather', 'i-radio', 'i-check', 'i-chevron', 'i-menu', 'i-x', 'i-sun', 'i-moon',
    'i-arrow-rtl', 'i-play', 'i-box', 'i-undo', 'i-link', 'i-cash', 'i-truck', 'i-store',
    'i-user', 'i-call', 'i-bubble', 'i-send'];

  var PRODUCT_TYPES = [
    { value: 'pet', label: 'حيوانات' },
    { value: 'clothing', label: 'حوايج' },
    { value: 'auto', label: 'سيارات' },
    { value: 'tech', label: 'تكنولوجيا' },
    { value: 'life', label: 'حياة يومية' },
  ];

  var FONTS = [
    { value: 'tajawal', label: 'Tajawal' },
    { value: 'cairo', label: 'Cairo' },
    { value: 'almarai', label: 'Almarai' },
  ];

  var RADII = [
    { value: 'sharp', label: 'زوايا حادّة' },
    { value: 'soft', label: 'زوايا ناعمة' },
    { value: 'round', label: 'زوايا دايرة' },
  ];

  var SECTION_LABELS = {
    hero: 'الواجهة',
    trust: 'الثقة',
    features: 'المزايا',
    how: 'كيفاش يخدم',
    lifestyle: 'نمط الحياة',
    gallery: 'الصور والمواصفات',
    reviews: 'آراء الزبائن',
    faq: 'أسئلة متكرّرة',
    cta: 'دعوة أخيرة',
    order: 'فورم الطلب',
  };

  /* ── وصفات الحقول ───────────────────────────────────────────────── */

  var t = function (key, label, hint) { return { key: key, label: label, type: 'text', hint: hint }; };
  var area = function (key, label, hint) { return { key: key, label: label, type: 'area', hint: hint }; };
  var num = function (key, label, hint) { return { key: key, label: label, type: 'number', hint: hint }; };
  var img = function (key, label, hint) { return { key: key, label: label, type: 'image', hint: hint }; };
  var ico = function (key, label) { return { key: key, label: label, type: 'icon' }; };
  var bool = function (key, label) { return { key: key, label: label, type: 'bool' }; };
  var lines = function (key, label, hint) { return { key: key, label: label, type: 'lines', hint: hint }; };
  var list = function (key, label, fields, hint) {
    return { key: key, label: label, type: 'list', fields: fields, hint: hint };
  };

  /*
   * الحقول تتبع بالضبط واش يقراه كل قسم في netlify/lib/render/sections/.
   * حقل ماشي هنا = حقل الزبون ما يشوفوش عمرو. لو زدت حقل في قسم، زيدو هنا.
   */
  var SECTION_FIELDS = {
    hero: [
      t('title', 'العنوان الكبير'),
      area('subtitle', 'النص تحتو'),
      img('image', 'الصورة الرئيسية'),
      t('imageAlt', 'وصف الصورة', 'للي ما يشوفوش الصورة، وللغوغل'),
      t('rating', 'التقييم', 'مثلاً 4.8 — يبان غير إذا كتبتو'),
      t('ratingNote', 'ملاحظة التقييم'),
      t('ctaLabel', 'زر الطلب'),
      t('ctaHref', 'رابط زر الطلب', 'خلّيه #order'),
      t('secondaryLabel', 'الزر الثاني'),
      t('secondaryHref', 'رابط الزر الثاني'),
      t('priceNote', 'ملاحظة السومة'),
      lines('assurances', 'ضمانات', 'وحدة في كل سطر'),
      list('floatCards', 'كروت طايرة (2 أقصى)', [ico('icon', 'أيقونة'), t('title', 'العنوان'), t('note', 'ملاحظة')]),
    ],
    trust: [
      t('rating', 'التقييم'),
      t('headline', 'الجملة'),
      list('badges', 'شارات', [ico('icon', 'أيقونة'), t('label', 'النص')]),
      list('stats', 'أرقام', [t('value', 'الرقم'), t('suffix', 'اللاحقة'), t('label', 'التسمية')]),
    ],
    features: [
      t('eyebrow', 'السطر الفوقاني'),
      t('title', 'العنوان'),
      area('subtitle', 'النص تحتو'),
      list('cards', 'كروت المزايا', [ico('icon', 'أيقونة'), t('title', 'العنوان'), area('body', 'الشرح')]),
    ],
    how: [
      t('eyebrow', 'السطر الفوقاني'),
      t('title', 'العنوان'),
      area('subtitle', 'النص تحتو'),
      list('steps', 'الخطوات', [ico('icon', 'أيقونة'), t('title', 'العنوان'), area('body', 'الشرح')]),
    ],
    lifestyle: [
      img('image', 'الصورة'),
      t('imageAlt', 'وصف الصورة'),
      t('title', 'العنوان'),
      lines('paragraphs', 'الفقرات', 'فقرة في كل سطر'),
      t('ctaLabel', 'زر'),
      t('ctaHref', 'رابط الزر'),
    ],
    gallery: [
      t('eyebrow', 'السطر الفوقاني'),
      t('title', 'العنوان'),
      img('mainImage', 'الصورة الكبيرة'),
      t('mainImageAlt', 'وصف الصورة الكبيرة'),
      list('thumbs', 'الصور الصغيرة', [img('src', 'الصورة'), img('thumbSrc', 'المصغّرة'), t('alt', 'الوصف')]),
      img('deviceImage', 'صورة الجهاز'),
      t('deviceImageAlt', 'وصف صورة الجهاز'),
      list('specs', 'المواصفات', [ico('icon', 'أيقونة'), t('label', 'التسمية'), t('value', 'القيمة')]),
      t('priceNote', 'ملاحظة السومة'),
      t('ctaLabel', 'زر'),
      t('ctaHref', 'رابط الزر'),
    ],
    reviews: [
      t('eyebrow', 'السطر الفوقاني'),
      t('title', 'العنوان'),
      t('handle', 'اسم الحساب'),
      t('handleNote', 'ملاحظة الحساب'),
      img('photo', 'صورة المنشور'),
      t('photoAlt', 'وصف صورة المنشور'),
      num('likesCount', 'عدد الإعجابات'),
      area('caption', 'نص المنشور'),
      num('totalComments', 'مجموع التعليقات'),
      list('comments', 'التعليقات', [
        t('name', 'الاسم'), img('avatar', 'الصورة'), bool('isBrand', 'حساب Qiti'),
        num('likes', 'إعجابات'), area('text', 'التعليق'), t('timeAgo', 'الوقت'),
      ], '⚠️ ما تكتبش آراء ماشي حقيقية — القسم ما يبانش أصلاً كي يكون فارغ'),
    ],
    faq: [
      t('eyebrow', 'السطر الفوقاني'),
      t('title', 'العنوان'),
      list('items', 'الأسئلة', [t('question', 'السؤال'), area('answer', 'الجواب')]),
    ],
    cta: [
      t('title', 'العنوان'),
      area('subtitle', 'النص تحتو'),
      t('ctaLabel', 'الزر'),
      t('ctaHref', 'رابط الزر'),
      list('assurances', 'ضمانات', [ico('icon', 'أيقونة'), t('label', 'النص')]),
    ],
    order: [
      t('eyebrow', 'السطر الفوقاني'),
      t('title', 'العنوان'),
      area('subtitle', 'النص تحتو'),
      area('productBlurb', 'وصف قصير للمنتج'),
      img('image', 'صورة جنب الفورم'),
      t('submitLabel', 'زر التأكيد'),
      t('codNote', 'ملاحظة الدفع'),
      t('footnote', 'ملاحظة أخيرة'),
    ],
  };

  /* ── أدوات ──────────────────────────────────────────────────────── */

  var root = document.getElementById('adminRoot');

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(n) { return Number(n || 0).toLocaleString('en-US'); }

  /** يقرا قيمة من كائن بمسار "a.b.0.c" */
  function getPath(obj, path) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  /** يكتب قيمة في كائن بمسار، ويصنع الحلقات الناقصة في الطريق */
  function setPath(obj, path, value) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      if (cur[key] == null) cur[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function delPath(obj, path) {
    var parts = path.split('.');
    var last = parts.pop();
    var parent = parts.length ? getPath(obj, parts.join('.')) : obj;
    if (!parent) return;
    if (Array.isArray(parent)) parent.splice(Number(last), 1);
    else delete parent[last];
  }

  var toastTimer = null;
  function toast(message, isError) {
    var node = document.querySelector('.toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.className = 'toast is-visible' + (isError ? ' is-error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.className = 'toast'; }, 3200);
  }

  /* ── الاتصال بالخادم ────────────────────────────────────────────── */

  /*
   * كل الأكشنات تمرّ من هنا. 401 يعني الجلسة طاحت — نرجّعو لشاشة الدخول
   * بدل ما نبيّنو خطأ غامض على كل زر يضغطو المستخدم من بعد.
   */
  async function api(action, payload) {
    var response = await fetch('/.netlify/functions/admin-api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
    });

    var data = await response.json().catch(function () { return {}; });

    if (response.status === 401) {
      state.authed = false;
      renderLogin();
      throw new Error('الجلسة انتهات.');
    }
    if (!response.ok) throw new Error(data.error || 'وقع مشكل.');
    return data;
  }

  async function loginStep(payload) {
    var response = await fetch('/.netlify/functions/admin-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || 'وقع مشكل.');
    return data;
  }

  /* ── الحالة ─────────────────────────────────────────────────────── */

  var state = {
    authed: false,
    view: 'campaigns',
    id: null,
    campaigns: [],
    products: [],
    categories: [],
    media: [],
    draft: null,      /* الحملة اللي راهي تتعدّل */
    product: null,    /* المنتج اللي راهو يتعدّل */
    stock: [],
    viewport: 'mobile',
  };

  /* ── شاشة الدخول ────────────────────────────────────────────────── */

  function renderLogin() {
    root.innerHTML =
      '<div class="login-screen"><div class="login-card">' +
        '<h1>لوحة تحكم <span style="color:var(--accent)">Qiti</span></h1>' +
        '<p class="sub">كلمة السر، ومن بعدها كود يوصلك في تيليغرام.</p>' +
        '<div class="err-msg" id="loginErr"></div>' +
        '<form id="loginForm">' +
          '<div class="field" id="pwField">' +
            '<label for="pw">كلمة السر</label>' +
            '<input type="password" id="pw" autocomplete="current-password" required>' +
          '</div>' +
          '<div class="field" id="codeField" hidden>' +
            '<label for="code">الكود (6 أرقام)</label>' +
            '<input type="text" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6">' +
          '</div>' +
          '<button class="btn btn--primary" type="submit" id="loginBtn">التالي</button>' +
        '</form>' +
      '</div></div>';

    var challengeId = null;
    var form = document.getElementById('loginForm');
    var err = document.getElementById('loginErr');
    var btn = document.getElementById('loginBtn');

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      err.textContent = '';
      btn.disabled = true;

      try {
        if (!challengeId) {
          var res = await loginStep({ step: 'password', password: document.getElementById('pw').value });
          challengeId = res.challengeId;
          document.getElementById('pwField').hidden = true;
          document.getElementById('codeField').hidden = false;
          document.getElementById('code').focus();
          btn.textContent = 'دخول';
        } else {
          await loginStep({ step: 'code', challengeId: challengeId, code: document.getElementById('code').value });
          state.authed = true;
          await boot();
          return;
        }
      } catch (error) {
        err.textContent = error.message;
        /* الكود الغالط يرجّعنا لكلمة السر — التحدّي يقدر يكون تحرق */
        if (challengeId) {
          challengeId = null;
          document.getElementById('pwField').hidden = false;
          document.getElementById('codeField').hidden = true;
          btn.textContent = 'التالي';
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ── الهيكل ─────────────────────────────────────────────────────── */

  var NAV = [
    { view: 'campaigns', label: 'الحملات' },
    { view: 'products', label: 'المنتجات' },
    { view: 'categories', label: 'الفئات' },
    { view: 'media', label: 'الصور' },
  ];

  function shell(title, actions, body) {
    return '<aside class="admin__sidebar">' +
        '<div class="admin__brand">Qiti <span>لوحة</span></div>' +
        '<nav class="admin__nav">' +
          NAV.map(function (item) {
            return '<a class="admin__nav-link' + (state.view === item.view ? ' is-active' : '') +
              '" href="#/' + item.view + '">' + esc(item.label) + '</a>';
          }).join('') +
        '</nav>' +
        '<div class="admin__sidebar-foot">' +
          '<button class="btn btn--outline btn--xs" data-act="logout">خروج</button>' +
        '</div>' +
      '</aside>' +
      '<main class="admin__main">' +
        '<header class="admin__header">' +
          '<h1 class="admin__title">' + esc(title) + '</h1>' +
          '<div class="admin__actions">' + (actions || '') + '</div>' +
        '</header>' +
        body +
      '</main>';
  }

  function emptyState(message) { return '<div class="empty-state">' + esc(message) + '</div>'; }

  /* ── قائمة الحملات ──────────────────────────────────────────────── */

  function renderCampaignList() {
    var rows = state.campaigns
      .slice()
      .sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); })
      .map(function (campaign) {
        var published = campaign.status === 'published';
        return '<div class="row-item">' +
            '<div>' +
              '<div class="row-item__name">' + esc(campaign.name || 'بلا اسم') + '</div>' +
              '<div class="row-item__meta">/' + esc(campaign.slug) + '</div>' +
            '</div>' +
            '<span class="badge badge--' + (published ? 'published">منشورة' : 'draft">مسوّدة') + '</span>' +
            '<div class="row-item__actions">' +
              (published ? '<a class="btn btn--outline btn--xs" href="/' + esc(campaign.slug) + '" target="_blank" rel="noopener">شوف</a>' : '') +
              '<a class="btn btn--outline btn--xs" href="#/campaigns/' + esc(campaign.id) + '">تعديل</a>' +
              '<button class="btn btn--twin btn--xs" data-act="dup" data-id="' + esc(campaign.id) + '">نسخ</button>' +
              '<button class="btn btn--xs ' + (published ? 'btn--outline' : 'btn--primary') + '" data-act="publish" data-id="' + esc(campaign.id) + '">' +
                (published ? 'ألغِ النشر' : 'انشر') + '</button>' +
              '<button class="btn btn--danger btn--xs" data-act="del-campaign" data-id="' + esc(campaign.id) + '">حذف</button>' +
            '</div>' +
          '</div>';
      }).join('');

    root.innerHTML = shell(
      'الحملات',
      '<a class="btn btn--primary" href="#/campaigns/new">حملة جديدة</a>',
      '<div class="admin-card"><div class="row-list">' +
        (rows || emptyState('مازال ما كاين حتى حملة. ابدا بوحدة.')) +
      '</div></div>',
    );
  }

  /* ── محرّر الحملة ───────────────────────────────────────────────── */

  function fieldHtml(def, value, path) {
    var id = 'f_' + path.replace(/\./g, '_');
    var hint = def.hint ? '<div class="hint">' + esc(def.hint) + '</div>' : '';

    if (def.type === 'bool') {
      return '<div class="field checkbox-row">' +
        '<input type="checkbox" id="' + id + '" data-path="' + esc(path) + '" data-kind="bool"' +
          (value ? ' checked' : '') + '>' +
        '<label for="' + id + '">' + esc(def.label) + '</label></div>';
    }

    var label = '<label for="' + id + '">' + esc(def.label) + '</label>';

    if (def.type === 'area') {
      return '<div class="field">' + label +
        '<textarea id="' + id + '" data-path="' + esc(path) + '">' + esc(value) + '</textarea>' + hint + '</div>';
    }

    if (def.type === 'number') {
      return '<div class="field">' + label +
        '<input type="number" id="' + id + '" data-path="' + esc(path) + '" data-kind="number" value="' +
        esc(value == null ? '' : value) + '">' + hint + '</div>';
    }

    if (def.type === 'lines') {
      var text = Array.isArray(value) ? value.join('\n') : '';
      return '<div class="field">' + label +
        '<textarea id="' + id + '" data-path="' + esc(path) + '" data-kind="lines">' + esc(text) + '</textarea>' +
        hint + '</div>';
    }

    if (def.type === 'icon') {
      return '<div class="field">' + label +
        '<select id="' + id + '" data-path="' + esc(path) + '">' +
          '<option value="">— بلا —</option>' +
          ICONS.map(function (name) {
            return '<option value="' + name + '"' + (value === name ? ' selected' : '') + '>' + name + '</option>';
          }).join('') +
        '</select>' + hint + '</div>';
    }

    if (def.type === 'select') {
      return '<div class="field">' + label +
        '<select id="' + id + '" data-path="' + esc(path) + '">' +
          def.options.map(function (option) {
            return '<option value="' + esc(option.value) + '"' +
              (String(value) === String(option.value) ? ' selected' : '') + '>' + esc(option.label) + '</option>';
          }).join('') +
        '</select>' + hint + '</div>';
    }

    if (def.type === 'image') {
      return '<div class="field">' + label +
        '<div class="image-field">' +
          '<img class="image-field__thumb" src="' + (value ? esc(value) : '') + '" alt="">' +
          '<input type="text" id="' + id + '" data-path="' + esc(path) + '" value="' + esc(value) + '" placeholder="/media/…">' +
          '<button type="button" class="btn btn--outline btn--xs" data-act="pick" data-path="' + esc(path) + '">اختر</button>' +
        '</div>' + hint + '</div>';
    }

    if (def.type === 'list') {
      var items = Array.isArray(value) ? value : [];
      return '<div class="field">' +
        '<div class="label">' + esc(def.label) + '</div>' +
        '<div class="group-list">' +
          items.map(function (item, index) {
            var itemPath = path + '.' + index;
            return '<div class="group-item">' +
              '<div class="group-item__head">' +
                '<button type="button" class="mini-btn" data-act="move" data-path="' + esc(path) + '" data-index="' + index + '" data-dir="-1" title="فوق">↑</button>' +
                '<button type="button" class="mini-btn" data-act="move" data-path="' + esc(path) + '" data-index="' + index + '" data-dir="1" title="تحت">↓</button>' +
                '<button type="button" class="mini-btn mini-btn--danger" data-act="del-item" data-path="' + esc(itemPath) + '" title="حذف">✕</button>' +
              '</div>' +
              def.fields.map(function (sub) {
                return fieldHtml(sub, (item || {})[sub.key], itemPath + '.' + sub.key);
              }).join('') +
            '</div>';
          }).join('') +
        '</div>' +
        '<button type="button" class="btn btn--outline btn--xs" data-act="add-item" data-path="' + esc(path) + '">＋ زيد</button>' +
        hint + '</div>';
    }

    return '<div class="field">' + label +
      '<input type="text" id="' + id + '" data-path="' + esc(path) + '" value="' + esc(value) + '">' + hint + '</div>';
  }

  function contrastRatio(a, b) {
    function lum(hex) {
      var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
      if (!m) return 0;
      var channels = [0, 2, 4].map(function (offset) {
        var v = parseInt(m[1].substr(offset, 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }
    var la = lum(a);
    var lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function themeBlock(theme) {
    var defaults = theme.mood === 'dark'
      ? { accent: '#FF6B2C', accentText: '#1A0E07', bg: '#0C0B0A', surface: '#161412', text: '#F6F2EE' }
      : { accent: '#FF6B2C', accentText: '#FFFFFF', bg: '#FFFFFF', surface: '#FFFFFF', text: '#14110F' };

    var color = function (key, label) {
      return '<div class="field"><label for="th_' + key + '">' + esc(label) + '</label>' +
        '<input type="color" id="th_' + key + '" data-path="theme.' + key + '" value="' +
        esc(theme[key] || defaults[key]) + '"></div>';
    };

    var ratio = contrastRatio(theme.text || defaults.text, theme.bg || defaults.bg);
    var warn = ratio < 4.5
      ? '<div class="hint" style="color:var(--danger)">⚠️ التباين بين النص والخلفية ' + ratio.toFixed(2) +
        ':1 — تحت 4.5:1. الصفحة ما تتقراش، والخادم يرفض هذا الثيم.</div>'
      : '<div class="hint">التباين ' + ratio.toFixed(2) + ':1 — مليح.</div>';

    return '<div class="admin-card"><h3>الشكل</h3>' +
      '<div class="form-grid">' +
        fieldHtml({ key: 'mood', label: 'الوضع', type: 'select', options: [
          { value: 'light', label: 'نهاري' }, { value: 'dark', label: 'ليلي' },
        ] }, theme.mood || 'light', 'theme.mood') +
        fieldHtml({ key: 'font', label: 'الخط', type: 'select', options: FONTS }, theme.font || 'tajawal', 'theme.font') +
        fieldHtml({ key: 'radius', label: 'الزوايا', type: 'select', options: RADII }, theme.radius || 'soft', 'theme.radius') +
        color('accent', 'لون العلامة') +
        color('accentText', 'كتابة فوق لون العلامة') +
        color('bg', 'الخلفية') +
        color('surface', 'خلفية الكروت') +
        color('text', 'لون النص') +
      '</div>' + warn + '</div>';
  }

  function renderCampaignEditor() {
    var draft = state.draft;
    var used = (draft.sections || []).map(function (s) { return s.type; });
    var addable = Object.keys(SECTION_LABELS).filter(function (type) { return used.indexOf(type) === -1; });

    var sectionsHtml = (draft.sections || []).map(function (section, index) {
      var fields = SECTION_FIELDS[section.type] || [];
      return '<details class="section-block">' +
        '<summary>' +
          '<span class="section-block__title">' + esc(SECTION_LABELS[section.type] || section.type) + '</span>' +
          '<span class="badge">' + esc(section.type) + '</span>' +
        '</summary>' +
        '<div class="section-block__body">' +
          '<div class="group-item__head">' +
            '<button type="button" class="mini-btn" data-act="move-section" data-index="' + index + '" data-dir="-1">↑</button>' +
            '<button type="button" class="mini-btn" data-act="move-section" data-index="' + index + '" data-dir="1">↓</button>' +
            '<button type="button" class="mini-btn mini-btn--danger" data-act="del-section" data-index="' + index + '">✕</button>' +
          '</div>' +
          '<div class="field checkbox-row">' +
            '<input type="checkbox" id="en_' + index + '" data-path="sections.' + index + '.enabled" data-kind="bool"' +
              (section.enabled !== false ? ' checked' : '') + '>' +
            '<label for="en_' + index + '">مفعّل</label>' +
          '</div>' +
          fields.map(function (def) {
            return fieldHtml(def, (section.data || {})[def.key], 'sections.' + index + '.data.' + def.key);
          }).join('') +
        '</div>' +
      '</details>';
    }).join('');

    var productOptions = [{ value: '', label: '— اختر منتج —' }].concat(
      state.products.map(function (p) { return { value: p.id, label: p.name + ' — ' + money(p.price) + ' دج' }; }),
    );

    var body = '<div class="editor-split">' +
      '<div class="editor-form">' +
        '<div class="admin-card"><h3>الأساس</h3><div class="form-grid">' +
          fieldHtml(t('name', 'اسم الحملة', 'داخلي برك — الزبون ما يشوفوش'), draft.name, 'name') +
          fieldHtml(t('slug', 'الرابط', 'qitishop.netlify.app/<الرابط>'), draft.slug, 'slug') +
          fieldHtml({ key: 'productId', label: 'المنتج', type: 'select', options: productOptions },
            draft.productId || '', 'productId') +
          fieldHtml(t('seo.title', 'عنوان غوغل'), (draft.seo || {}).title, 'seo.title') +
          '<div class="field field--full">' +
            fieldHtml(area('seo.description', 'وصف غوغل'), (draft.seo || {}).description, 'seo.description') +
          '</div>' +
        '</div></div>' +

        themeBlock(draft.theme || {}) +

        '<div class="admin-card"><h3>الأقسام</h3>' +
          (sectionsHtml || emptyState('اختر منتج وضغط "أقسام جاهزة".')) +
          '<div class="add-section-row">' +
            '<select id="addSectionType">' +
              addable.map(function (type) {
                return '<option value="' + type + '">' + esc(SECTION_LABELS[type]) + '</option>';
              }).join('') +
            '</select>' +
            '<button type="button" class="btn btn--outline btn--xs" data-act="add-section">زيد قسم</button>' +
            '<button type="button" class="btn btn--outline btn--xs" data-act="blank-sections">أقسام جاهزة</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="preview-panel">' +
        '<div class="preview-toolbar">' +
          ['mobile', 'tablet', 'desktop'].map(function (size) {
            var labels = { mobile: 'تيليفون', tablet: 'تابلت', desktop: 'حاسوب' };
            return '<button type="button" class="viewport-btn' + (state.viewport === size ? ' is-active' : '') +
              '" data-act="viewport" data-size="' + size + '">' + labels[size] + '</button>';
          }).join('') +
        '</div>' +
        '<div class="preview-frame-wrap" data-viewport="' + state.viewport + '">' +
          '<div class="preview-frame"><iframe id="previewFrame" title="معاينة"></iframe></div>' +
        '</div>' +
        '<div class="save-indicator" id="saveIndicator"></div>' +
      '</div>' +
    '</div>';

    var isPublished = draft.status === 'published';
    var actions =
      '<a class="btn btn--outline" href="#/campaigns">رجوع</a>' +
      (draft.id ? '<a class="btn btn--outline" href="/' + esc(draft.slug) + '" target="_blank" rel="noopener">شوف الصفحة</a>' : '') +
      '<button class="btn btn--outline" data-act="save-campaign">حفظ</button>' +
      '<button class="btn btn--primary" data-act="save-publish">' +
        (isPublished ? 'حفظ وابقَ منشورة' : 'حفظ وانشر') + '</button>';

    root.innerHTML = shell(draft.name || 'حملة جديدة', actions, body);
    refreshPreview();
  }

  /* المعاينة تنادي نفس الرندر تاع الصفحة الحقيقية — بلا حفظ */
  var previewTimer = null;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 500);
  }

  async function refreshPreview() {
    var frame = document.getElementById('previewFrame');
    if (!frame || !state.draft) return;
    try {
      var res = await api('preview', { campaign: state.draft, productId: state.draft.productId || null });
      frame.srcdoc = res.html;
    } catch (error) {
      /* المعاينة تفشل بالسكات — ما نقطعوش الخدمة على المستخدم على وُدّها */
      console.warn('preview failed:', error.message);
    }
  }

  /* ── المنتجات ───────────────────────────────────────────────────── */

  function renderProductList() {
    var rows = state.products.map(function (product) {
      return '<div class="row-item">' +
          '<div>' +
            '<div class="row-item__name">' + esc(product.name || 'بلا اسم') + '</div>' +
            '<div class="row-item__meta">/p/' + esc(product.slug) + ' · ' + money(product.price) + ' دج</div>' +
          '</div>' +
          '<span class="badge">' + esc(product.type) + '</span>' +
          '<div class="row-item__actions">' +
            '<a class="btn btn--outline btn--xs" href="#/products/' + esc(product.id) + '">تعديل</a>' +
          '</div>' +
        '</div>';
    }).join('');

    root.innerHTML = shell(
      'المنتجات',
      '<a class="btn btn--primary" href="#/products/new">منتج جديد</a>',
      '<div class="admin-card"><div class="row-list">' +
        (rows || emptyState('مازال ما كاين حتى منتج.')) +
      '</div></div>',
    );
  }

  function stockTable() {
    if (!state.stock.length) return '';
    var rows = state.stock.map(function (entry) {
      var labels = Object.keys(entry.variant.options || {}).map(function (key) {
        return key + ': ' + entry.variant.options[key];
      }).join(' · ') || 'وحيد';
      var low = entry.stock.qty <= entry.stock.threshold;
      return '<tr>' +
        '<td>' + esc(labels) + '</td>' +
        '<td class="' + (low ? 'stock-low' : '') + '">' +
          '<input type="number" min="0" value="' + Number(entry.stock.qty) + '" data-stock-qty="' + esc(entry.variant.sku) + '">' +
        '</td>' +
        '<td><input type="number" min="0" value="' + Number(entry.stock.threshold) + '" data-stock-threshold="' + esc(entry.variant.sku) + '"></td>' +
        '<td><button type="button" class="btn btn--outline btn--xs" data-act="save-stock" data-sku="' + esc(entry.variant.sku) + '">حفظ</button></td>' +
      '</tr>';
    }).join('');

    return '<div class="admin-card" style="padding:18px"><h3>المخزون</h3>' +
      '<table class="stock-table"><thead><tr>' +
        '<th>الفاريانت</th><th>الكمية</th><th>حد التنبيه</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderProductEditor() {
    var product = state.product;

    var categoryOptions = [{ value: '', label: '— بلا فئة —' }].concat(
      state.categories.map(function (c) { return { value: c.id, label: c.name }; }),
    );

    var optionsHtml = (product.options || []).map(function (option, index) {
      return '<div class="group-item">' +
        '<div class="group-item__head">' +
          '<button type="button" class="mini-btn mini-btn--danger" data-act="del-item" data-path="options.' + index + '">✕</button>' +
        '</div>' +
        fieldHtml(t('name', 'اسم الخيار', 'مثلاً: المقاس'), option.name, 'options.' + index + '.name') +
        fieldHtml(lines('values', 'القيم', 'وحدة في كل سطر: S / M / L'), option.values, 'options.' + index + '.values') +
      '</div>';
    }).join('');

    var body = '<div class="admin-card" style="padding:18px;margin-bottom:16px"><div class="form-grid">' +
        fieldHtml(t('name', 'اسم المنتج'), product.name, 'name') +
        fieldHtml(t('slug', 'الرابط'), product.slug, 'slug') +
        fieldHtml({ key: 'type', label: 'النوع', type: 'select', options: PRODUCT_TYPES }, product.type || 'life', 'type') +
        fieldHtml({ key: 'categoryId', label: 'الفئة', type: 'select', options: categoryOptions }, product.categoryId || '', 'categoryId') +
        fieldHtml(num('price', 'السومة (دج)'), product.price, 'price') +
        fieldHtml(num('compareAtPrice', 'السومة القديمة (دج)', 'تتشطب في الصفحة'), product.compareAtPrice, 'compareAtPrice') +
        fieldHtml(num('unitCost', 'تكلفة السلعة (دج)', 'باش يتحسب الربح'), product.unitCost, 'unitCost') +
        fieldHtml({ key: 'status', label: 'الحالة', type: 'select', options: [
          { value: 'active', label: 'نشط' }, { value: 'archived', label: 'مؤرشف' },
        ] }, product.status || 'active', 'status') +
      '</div></div>' +

      '<div class="admin-card" style="padding:18px;margin-bottom:16px">' +
        '<h3>الخيارات (مقاسات، ألوان…)</h3>' +
        '<div class="hint" style="margin-bottom:10px">⚠️ تبديل الخيارات يعاود يبني الفاريانتات. حيّد قيمة = تحيّد مخزونها.</div>' +
        '<div class="group-list">' + optionsHtml + '</div>' +
        '<button type="button" class="btn btn--outline btn--xs" data-act="add-option">＋ زيد خيار</button>' +
      '</div>' +

      stockTable();

    root.innerHTML = shell(
      product.name || 'منتج جديد',
      '<a class="btn btn--outline" href="#/products">رجوع</a>' +
      '<button class="btn btn--primary" data-act="save-product">حفظ</button>',
      body,
    );
  }

  /* ── الفئات ─────────────────────────────────────────────────────── */

  function renderCategories() {
    var rows = state.categories.map(function (category) {
      return '<div class="row-item">' +
          '<div>' +
            '<div class="row-item__name">' + esc(category.name) + '</div>' +
            '<div class="row-item__meta">/c/' + esc(category.slug) + '</div>' +
          '</div>' +
          '<span class="badge">' + Number(category.sort || 0) + '</span>' +
          '<div class="row-item__actions">' +
            '<button class="btn btn--outline btn--xs" data-act="edit-category" data-id="' + esc(category.id) + '">تعديل</button>' +
          '</div>' +
        '</div>';
    }).join('');

    root.innerHTML = shell(
      'الفئات',
      '<button class="btn btn--primary" data-act="edit-category" data-id="">فئة جديدة</button>',
      '<div class="admin-card"><div class="row-list">' +
        (rows || emptyState('مازال ما كاين حتى فئة.')) +
      '</div></div>',
    );
  }

  function categoryModal(category) {
    var draft = Object.assign({ name: '', slug: '', tagline: '', icon: '', sort: 0 }, category || {});
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal">' +
      '<h3>' + (category ? 'تعديل فئة' : 'فئة جديدة') + '</h3>' +
      '<div class="field"><label>الاسم</label><input type="text" id="catName" value="' + esc(draft.name) + '"></div>' +
      '<div class="field"><label>الرابط</label><input type="text" id="catSlug" value="' + esc(draft.slug) + '"></div>' +
      '<div class="field"><label>جملة قصيرة</label><input type="text" id="catTagline" value="' + esc(draft.tagline) + '"></div>' +
      '<div class="field"><label>الأيقونة</label><select id="catIcon"><option value="">— بلا —</option>' +
        ICONS.map(function (name) {
          return '<option value="' + name + '"' + (draft.icon === name ? ' selected' : '') + '>' + name + '</option>';
        }).join('') + '</select></div>' +
      '<div class="field"><label>الترتيب</label><input type="number" id="catSort" value="' + Number(draft.sort || 0) + '"></div>' +
      '<div class="modal__foot">' +
        '<button class="btn btn--outline btn--xs" data-close>إلغاء</button>' +
        '<button class="btn btn--primary btn--xs" id="catSave">حفظ</button>' +
      '</div></div>';

    document.body.appendChild(overlay);
    var close = function () { overlay.remove(); };
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.hasAttribute('data-close')) close();
    });

    overlay.querySelector('#catSave').addEventListener('click', async function () {
      try {
        await api('categories.save', {
          category: {
            id: draft.id,
            name: overlay.querySelector('#catName').value,
            slug: overlay.querySelector('#catSlug').value,
            tagline: overlay.querySelector('#catTagline').value,
            icon: overlay.querySelector('#catIcon').value || null,
            sort: Number(overlay.querySelector('#catSort').value) || 0,
          },
        });
        close();
        state.categories = (await api('categories.list')).categories;
        renderCategories();
        toast('تحفظات.');
      } catch (error) {
        toast(error.message, true);
      }
    });
  }

  /* ── الصور ──────────────────────────────────────────────────────── */

  function mediaGrid(onPick) {
    return state.media.map(function (item) {
      return '<div class="media-item"' + (onPick ? ' data-pick="/media/' + esc(item.id) + '"' : '') + '>' +
        '<img src="/media/' + esc(item.id) + '" alt="' + esc(item.alt || '') + '" loading="lazy">' +
        '<div class="media-item__foot">' +
          '<span class="media-item__name">' + esc(item.filename) + '</span>' +
          (onPick ? '' : '<button class="media-item__del" data-act="del-media" data-id="' + esc(item.id) + '" title="حذف">✕</button>') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderMedia() {
    root.innerHTML = shell('الصور', '',
      '<div class="media-upload-row">' +
        '<input type="file" id="mediaFile" accept="image/jpeg,image/png,image/webp,image/avif" multiple>' +
        '<span class="hint">jpeg / png / webp / avif — 5 ميغا أقصى</span>' +
      '</div>' +
      '<div class="media-grid">' + (mediaGrid(false) || emptyState('مازال ما كاينة حتى صورة.')) + '</div>');

    document.getElementById('mediaFile').addEventListener('change', async function (event) {
      var files = Array.prototype.slice.call(event.target.files || []);
      if (!files.length) return;
      toast('راهي تطلع…');
      for (var i = 0; i < files.length; i++) {
        try {
          await uploadFile(files[i]);
        } catch (error) {
          toast(error.message, true);
        }
      }
      state.media = (await api('media.list')).media;
      renderMedia();
      toast('طلعات.');
    });
  }

  async function uploadFile(file) {
    var form = new FormData();
    form.append('file', file);
    var response = await fetch('/.netlify/functions/media-upload', { method: 'POST', body: form });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || 'ما قدرناش نطلعو ' + file.name);
    return data;
  }

  /* نافذة اختيار صورة — ترجع وعد بالرابط ولا null */
  async function pickMedia() {
    /* اللوحة تقدر تكون فتحات على محرّر مباشرةً بلا ما تعدّي على صفحة
       الصور — فنجيبو القائمة هنا إذا مازال ما تحمّلتش */
    if (!state.media.length) {
      state.media = (await api('media.list')).media.filter(Boolean);
    }

    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = '<div class="modal">' +
        '<h3>اختر صورة</h3>' +
        '<div class="media-upload-row">' +
          '<input type="file" id="pickUpload" accept="image/jpeg,image/png,image/webp,image/avif">' +
        '</div>' +
        '<div class="media-grid" id="pickGrid">' +
          (mediaGrid(true) || emptyState('ماكاينش صور. طلّع وحدة.')) +
        '</div>' +
        '<div class="modal__foot"><button class="btn btn--outline btn--xs" data-close>إلغاء</button></div>' +
      '</div>';

      document.body.appendChild(overlay);
      var done = function (value) { overlay.remove(); resolve(value); };

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay || event.target.hasAttribute('data-close')) return done(null);
        var item = event.target.closest('[data-pick]');
        if (item) done(item.getAttribute('data-pick'));
      });

      overlay.querySelector('#pickUpload').addEventListener('change', async function (event) {
        var file = (event.target.files || [])[0];
        if (!file) return;
        try {
          var record = await uploadFile(file);
          state.media = (await api('media.list')).media;
          done('/media/' + record.id);
        } catch (error) {
          toast(error.message, true);
        }
      });
    });
  }

  /* ── الحفظ ──────────────────────────────────────────────────────── */

  async function saveCampaign(publish) {
    var draft = state.draft;
    if (publish) draft.status = 'published';
    /* الـ select يعطي '' كي ما يكونش مختار — و'' ماشي nullish، فتخزّن
       كيما هي وتخلّي الحملة "عندها منتج" بمعرّف فارغ */
    if (!draft.productId) draft.productId = null;

    try {
      var res = await api('campaigns.save', { campaign: draft });
      state.draft = res.campaign;
      state.campaigns = (await api('campaigns.list')).campaigns;
      /* أول حفظ يعطينا id — نبدّلو الهاش باش refresh ما يضيّعش الحملة */
      if (location.hash !== '#/campaigns/' + res.campaign.id) {
        location.hash = '#/campaigns/' + res.campaign.id;
      } else {
        renderCampaignEditor();
      }
      toast(publish ? 'تنشرات على /' + res.campaign.slug : 'تحفظات.');
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function saveProduct() {
    try {
      var res = await api('products.save', { product: state.product });
      state.products = (await api('products.list')).products;
      if (location.hash !== '#/products/' + res.product.id) {
        location.hash = '#/products/' + res.product.id;
      } else {
        var full = await api('products.get', { id: res.product.id });
        state.product = full.product;
        state.stock = full.stock;
        renderProductEditor();
      }
      toast('تحفظ.');
    } catch (error) {
      toast(error.message, true);
    }
  }

  /* ── المستمعات ──────────────────────────────────────────────────── */

  /* مستمع واحد للكتابة: يقرا data-path ويكتب في الحالة. شوف الشرح فوق. */
  function onInput(event) {
    var node = event.target;
    var path = node.getAttribute && node.getAttribute('data-path');
    if (!path) return;

    var target = state.draft || state.product;
    if (!target) return;

    var kind = node.getAttribute('data-kind');
    var value;

    if (kind === 'bool') value = node.checked;
    else if (kind === 'number') value = node.value === '' ? null : Number(node.value);
    else if (kind === 'lines') {
      value = node.value.split('\n').map(function (line) { return line.trim(); })
        .filter(function (line) { return line.length; });
    } else value = node.value;

    setPath(target, path, value);

    /* معاينة الصورة الصغيرة تتبدّل فوراً بلا ما نعاودو بناء الفورم */
    if (node.type === 'text' && node.parentElement && node.parentElement.classList.contains('image-field')) {
      var thumb = node.parentElement.querySelector('.image-field__thumb');
      if (thumb) thumb.src = value || '';
    }

    if (state.draft) schedulePreview();
  }

  async function onClick(event) {
    var node = event.target.closest('[data-act]');
    if (!node) return;
    var act = node.getAttribute('data-act');
    var target = state.draft || state.product;

    /* ── تنقّل وجلسة ── */
    if (act === 'logout') {
      await loginStep({ step: 'logout' }).catch(function () {});
      state.authed = false;
      renderLogin();
      return;
    }

    /* ── قوائم داخل الفورم ── */
    if (act === 'add-item') {
      var path = node.getAttribute('data-path');
      var arr = getPath(target, path);
      if (!Array.isArray(arr)) { arr = []; setPath(target, path, arr); }
      arr.push({});
      rerenderEditor();
      return;
    }

    if (act === 'del-item') {
      delPath(target, node.getAttribute('data-path'));
      rerenderEditor();
      return;
    }

    if (act === 'move') {
      var listPath = node.getAttribute('data-path');
      var index = Number(node.getAttribute('data-index'));
      var dir = Number(node.getAttribute('data-dir'));
      var items = getPath(target, listPath) || [];
      var next = index + dir;
      if (next >= 0 && next < items.length) {
        var moved = items.splice(index, 1)[0];
        items.splice(next, 0, moved);
        rerenderEditor();
      }
      return;
    }

    if (act === 'pick') {
      var pickPath = node.getAttribute('data-path');
      var url = await pickMedia();
      if (url) {
        setPath(target, pickPath, url);
        rerenderEditor();
      }
      return;
    }

    /* ── أقسام الحملة ── */
    if (act === 'add-section') {
      var type = document.getElementById('addSectionType').value;
      if (!type) return;
      state.draft.sections = state.draft.sections || [];
      state.draft.sections.push({ type: type, enabled: true, order: state.draft.sections.length + 1, data: {} });
      reorderSections();
      renderCampaignEditor();
      return;
    }

    if (act === 'del-section') {
      state.draft.sections.splice(Number(node.getAttribute('data-index')), 1);
      reorderSections();
      renderCampaignEditor();
      return;
    }

    if (act === 'move-section') {
      var si = Number(node.getAttribute('data-index'));
      var sdir = Number(node.getAttribute('data-dir'));
      var sections = state.draft.sections;
      var sn = si + sdir;
      if (sn >= 0 && sn < sections.length) {
        var s = sections.splice(si, 1)[0];
        sections.splice(sn, 0, s);
        reorderSections();
        renderCampaignEditor();
      }
      return;
    }

    if (act === 'blank-sections') {
      var product = state.products.filter(function (p) { return p.id === state.draft.productId; })[0];
      var res = await api('sections.blank', { type: product ? product.type : 'life' });
      state.draft.sections = res.sections;
      renderCampaignEditor();
      return;
    }

    if (act === 'viewport') {
      state.viewport = node.getAttribute('data-size');
      document.querySelector('.preview-frame-wrap').setAttribute('data-viewport', state.viewport);
      Array.prototype.forEach.call(document.querySelectorAll('.viewport-btn'), function (button) {
        button.classList.toggle('is-active', button.getAttribute('data-size') === state.viewport);
      });
      return;
    }

    /* ── حفظ ── */
    if (act === 'save-campaign') return saveCampaign(false);
    if (act === 'save-publish') return saveCampaign(true);
    if (act === 'save-product') return saveProduct();

    if (act === 'add-option') {
      state.product.options = state.product.options || [];
      state.product.options.push({ name: '', values: [] });
      renderProductEditor();
      return;
    }

    if (act === 'save-stock') {
      var sku = node.getAttribute('data-sku');
      try {
        await api('stock.set', {
          productId: state.product.id,
          sku: sku,
          qty: Number(document.querySelector('[data-stock-qty="' + sku + '"]').value),
          threshold: Number(document.querySelector('[data-stock-threshold="' + sku + '"]').value),
        });
        toast('المخزون تبدّل.');
      } catch (error) {
        toast(error.message, true);
      }
      return;
    }

    /* ── قوائم ── */
    if (act === 'publish') {
      try {
        await api('campaigns.publish', { id: node.getAttribute('data-id') });
        state.campaigns = (await api('campaigns.list')).campaigns;
        renderCampaignList();
      } catch (error) { toast(error.message, true); }
      return;
    }

    if (act === 'dup') {
      try {
        var copy = await api('campaigns.duplicate', { id: node.getAttribute('data-id') });
        state.campaigns = (await api('campaigns.list')).campaigns;
        location.hash = '#/campaigns/' + copy.campaign.id;
      } catch (error) { toast(error.message, true); }
      return;
    }

    if (act === 'del-campaign') {
      if (!confirm('تحيّد هذي الحملة؟ الرابط يولّي 404.')) return;
      try {
        await api('campaigns.delete', { id: node.getAttribute('data-id') });
        state.campaigns = (await api('campaigns.list')).campaigns;
        renderCampaignList();
        toast('تحيّدات.');
      } catch (error) { toast(error.message, true); }
      return;
    }

    if (act === 'edit-category') {
      var id = node.getAttribute('data-id');
      var category = state.categories.filter(function (c) { return c.id === id; })[0];
      categoryModal(category || null);
      return;
    }

    if (act === 'del-media') {
      if (!confirm('تحيّد هذي الصورة؟ الحملات اللي تستعملها يبقاو بلا صورة.')) return;
      try {
        await api('media.delete', { id: node.getAttribute('data-id') });
        state.media = (await api('media.list')).media;
        renderMedia();
      } catch (error) { toast(error.message, true); }
    }
  }

  /* ترتيب الأقسام يتخزّن كرقم — نعاودو نرقّموه بعد كل تحريك */
  function reorderSections() {
    (state.draft.sections || []).forEach(function (section, index) { section.order = index + 1; });
  }

  /*
   * زيد/حيّد عنصر يفرض إعادة بناء الفورم. بلا هذا، كل ضغطة على "زيد"
   * تطوي كل الأقسام وترجّع التمرير لفوق — والمستخدم يضيع بلاصتو.
   */
  function rerenderEditor() {
    var form = document.querySelector('.editor-form');
    var scrollTop = form ? form.scrollTop : 0;
    var open = Array.prototype.map.call(
      document.querySelectorAll('.section-block'),
      function (block) { return block.open; },
    );

    if (state.draft) renderCampaignEditor();
    else if (state.product) { renderProductEditor(); return; }
    else return;

    Array.prototype.forEach.call(document.querySelectorAll('.section-block'), function (block, index) {
      if (open[index]) block.open = true;
    });
    var next = document.querySelector('.editor-form');
    if (next) next.scrollTop = scrollTop;
  }

  /* ── الراوتينغ ──────────────────────────────────────────────────── */

  async function route() {
    if (!state.authed) return;

    var parts = (location.hash || '#/campaigns').replace(/^#\/?/, '').split('/');
    state.view = parts[0] || 'campaigns';
    state.id = parts[1] || null;
    state.draft = null;
    state.product = null;
    state.stock = [];

    root.innerHTML = '<div class="loading-line">راهي تحمّل…</div>';

    try {
      if (state.view === 'campaigns' && state.id) {
        if (state.id === 'new') {
          state.draft = { name: '', slug: '', productId: null, theme: {}, sections: [], status: 'draft', seo: {} };
        } else {
          state.draft = (await api('campaigns.get', { id: state.id })).campaign;
        }
        if (!state.products.length) state.products = (await api('products.list')).products;
        renderCampaignEditor();
        return;
      }

      if (state.view === 'products' && state.id) {
        if (state.id === 'new') {
          state.product = { name: '', slug: '', type: 'life', price: 0, unitCost: 0, options: [], status: 'active' };
        } else {
          var res = await api('products.get', { id: state.id });
          state.product = res.product;
          state.stock = res.stock;
        }
        if (!state.categories.length) state.categories = (await api('categories.list')).categories;
        renderProductEditor();
        return;
      }

      if (state.view === 'products') {
        state.products = (await api('products.list')).products;
        renderProductList();
        return;
      }

      if (state.view === 'categories') {
        state.categories = (await api('categories.list')).categories;
        renderCategories();
        return;
      }

      if (state.view === 'media') {
        state.media = (await api('media.list')).media;
        renderMedia();
        return;
      }

      state.view = 'campaigns';
      state.campaigns = (await api('campaigns.list')).campaigns;
      renderCampaignList();
    } catch (error) {
      if (state.authed) root.innerHTML = '<div class="empty-state">' + esc(error.message) + '</div>';
    }
  }

  /* ── الإقلاع ────────────────────────────────────────────────────── */

  async function boot() {
    try {
      /* أرخص طلب موجود — إذا رجع 401 فالمستمع فوق يرمينا لشاشة الدخول */
      state.campaigns = (await api('campaigns.list')).campaigns;
      state.authed = true;
    } catch (error) {
      if (!state.authed) return;
      toast(error.message, true);
    }
    await route();
  }

  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  document.addEventListener('click', onClick);
  window.addEventListener('hashchange', route);

  boot();
})();
