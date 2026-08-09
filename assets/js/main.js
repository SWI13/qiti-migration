/* =============================================================
   Qiti — تفاعلات صفحة الهبوط
   جافاسكريبت عادي بلا أي مكتبة. إذا تعطّل الجافاسكريبت، المحتوى
   يبقى بايّن ومقروء، غير الأنيميشن والفورم اللي ما يخدموش.
   ============================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── مصدر الطلب: منين جا الزبون ─────────────────────────────────
     الإعلان يزيد params في الرابط — `utm_*` تكتبهم انت في رابط الإعلان،
     و`fbclid`/`ttclid` تزيدهم المنصّة روحها. نخزّنوهم كي يحلّ الصفحة،
     ونبعثوهم مع الطلب، باش تعرف أشمن إعلان جابلك زبون خلّص فعلاً.

     ⚠️ هذي المعلومة **ما تتعوّضش لور**: إذا الطلب تسجّل بلاها، عمرك ما
     تعرف منين جا. علاش لازم تكون خدّامة قبل أوّل دينار تصرفو في الإعلانات. */
  var ATTRIBUTION_KEY = 'qiti-attribution';
  var ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;   /* 30 يوم */
  var ATTRIBUTION_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'fbclid', 'ttclid'
  ];

  function readStoredAttribution() {
    try {
      var raw = localStorage.getItem(ATTRIBUTION_KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      if (!saved || !saved.landedAt) return null;
      /* إعلان قديم بزاف ما يستاهلش ينسب ليه الطلب */
      if (Date.now() - saved.landedAt > ATTRIBUTION_TTL_MS) return null;
      return saved;
    } catch (e) {
      return null;   /* التصفّح الخاص يرمي خطأ على localStorage — ما يهمّش */
    }
  }

  /* نقرة جديدة على إعلان تغلب القديمة (last click)، وإذا حلّ الصفحة
     بلا params نخلّيو اللي مخزّن من الزيارة الأصلية. */
  function captureAttribution() {
    var params = new URLSearchParams(window.location.search);
    var found = {};
    var any = false;

    ATTRIBUTION_PARAMS.forEach(function (key) {
      var value = params.get(key);
      if (value) { found[key] = value; any = true; }
    });

    if (!any) return readStoredAttribution();

    found.landedAt = Date.now();
    try { localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(found)); } catch (e) {}
    return found;
  }

  var attribution = captureAttribution();

  /* ── بدّل الثيم (ليلي / نهاري) ─────────────────────────────── */
  var root = document.documentElement;
  var themeToggle = document.getElementById('themeToggle');

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('qiti-theme', next); } catch (e) {}
    });
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    var stored;
    try { stored = localStorage.getItem('qiti-theme'); } catch (err) {}
    if (!stored) root.dataset.theme = e.matches ? 'dark' : 'light';
  });

  /* ── ظل شريط التنقّل + ظهور زر "اطلب الان" العائم عند التمرير ─── */
  var nav = document.getElementById('nav');
  var floatingCta = document.querySelector('.floating-cta');
  var floatThreshold = window.innerHeight * 0.6;
  window.addEventListener('resize', function () {
    floatThreshold = window.innerHeight * 0.6;
  }, { passive: true });

  var onScroll = function () {
    nav.classList.toggle('is-stuck', window.scrollY > 12);
    if (floatingCta) floatingCta.classList.toggle('is-visible', window.scrollY > floatThreshold);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ── قائمة الموبايل ───────────────────────────────────────── */
  var burger = document.getElementById('burger');
  var menu = document.getElementById('mobileMenu');

  function setMenu(open) {
    menu.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
    burger.querySelector('use').setAttribute('href', open ? '#i-x' : '#i-menu');
  }

  if (burger && menu) {
    burger.addEventListener('click', function () { setMenu(menu.hidden); });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', function (e) {
      if (e.matches) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) setMenu(false);
    });
  }

  /* ── ظهور تدريجي عند التمرير ──────────────────────────────── */
  var revealables = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    revealables.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ── عدّاد الأرقام المتحرّك ───────────────────────────────── */
  var counters = document.querySelectorAll('[data-count]');

  function formatNumber(n) {
    return n.toLocaleString('en-US');
  }

  function runCounter(el) {
    var target = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';

    if (reduceMotion) {
      el.textContent = formatNumber(target) + suffix;
      return;
    }

    var duration = 1600;
    var start = null;

    function tick(now) {
      if (start === null) start = now;
      var p = Math.min((now - start) / duration, 1);
      var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = formatNumber(Math.round(target * eased)) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  if ('IntersectionObserver' in window) {
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        runCounter(entry.target);
        counterObserver.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { counterObserver.observe(el); });
  } else {
    counters.forEach(runCounter);
  }

  /* ── FAQ: نخلّيو غير جواب واحد محلول ──────────────────────── */
  var faqItems = document.querySelectorAll('.faq__item');
  faqItems.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      faqItems.forEach(function (other) {
        if (other !== item) other.open = false;
      });
    });
  });

  /* ── معرض صور المنتج ──────────────────────────────────────── */
  var galleryImg = document.getElementById('galleryImg');
  var thumbs = document.querySelectorAll('.thumb');

  thumbs.forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      if (thumb.classList.contains('is-active')) return;
      galleryImg.src = thumb.dataset.src;
      galleryImg.alt = thumb.dataset.alt || '';
      thumbs.forEach(function (t) {
        t.classList.toggle('is-active', t === thumb);
        t.setAttribute('aria-selected', String(t === thumb));
      });
    });
  });

  /* ── فورم الطلب ────────────────────────────────────────────── */

  /*
   * التسعير يجي من السيرفر في وسم <script id="qiti-pricing"> اللي يكتبو
   * قسم الطلب. قبل، السومة كانت مكتوبة باليد هنا **وفي** message.mjs —
   * زوج بلايص لازم تبدّلهم مع بعض، وكي تنسى وحدة الزبون يشوف سومة
   * والسيرفر يحسب وحدة أخرى.
   *
   * الصفحة القديمة (index.html) ما فيهاش هذا الوسم، فنرجعو للقيم
   * الثابتة كي ما نلقاوهش — باش الموقع الحالي يبقى خدّام كيما هو.
   *
   * ⚠️ هذي القيم للعرض برك. السيرفر يعاود يحسب المجموع في order.mjs
   * وما يثق حتى في رقم جاي من هنا.
   */
  var PRICING = (function () {
    var fallback = { price: 3900, shipping: { home: 600, desk: 400 }, options: [], variants: [] };
    var el = document.getElementById('qiti-pricing');
    if (!el) return fallback;
    try {
      var parsed = JSON.parse(el.textContent);
      return {
        productId: parsed.productId || null,
        price: typeof parsed.price === 'number' ? parsed.price : fallback.price,
        shipping: parsed.shipping || fallback.shipping,
        options: parsed.options || [],
        variants: parsed.variants || []
      };
    } catch (e) {
      return fallback;   /* JSON مهرّس ما يوقّفش الفورم */
    }
  })();

  var PRODUCT_PRICE = PRICING.price;
  var SHIPPING = PRICING.shipping;

  /* الولايات — الصفحات الجديدة تعمّرهم في السيرفر، والقديمة هنا */
  var WILAYAS = [
    'أدرار', 'الشلف', 'الأغواط', 'أم البواقي', 'باتنة', 'بجاية', 'بسكرة', 'بشار',
    'البليدة', 'البويرة', 'تمنراست', 'تبسة', 'تلمسان', 'تيارت', 'تيزي وزو', 'الجزائر',
    'الجلفة', 'جيجل', 'سطيف', 'سعيدة', 'سكيكدة', 'سيدي بلعباس', 'عنابة', 'قالمة',
    'قسنطينة', 'المدية', 'مستغانم', 'المسيلة', 'معسكر', 'ورقلة', 'وهران', 'البيض',
    'إليزي', 'برج بوعريريج', 'بومرداس', 'الطارف', 'تندوف', 'تيسمسيلت', 'الوادي',
    'خنشلة', 'سوق أهراس', 'تيبازة', 'ميلة', 'عين الدفلى', 'النعامة', 'عين تموشنت',
    'غرداية', 'غليزان', 'تيميمون', 'برج باجي مختار', 'أولاد جلال', 'بني عباس',
    'عين صالح', 'عين قزام', 'تقرت', 'جانت', 'المغير', 'المنيعة'
  ];

  var form = document.getElementById('orderForm');
  if (form) {
    /* إذا السيرفر عمّرهم من قبل ما نعاودوش — وإلا يتضاعفو */
    var wilayaSelect = document.getElementById('fWilaya');
    if (wilayaSelect.options.length <= 1) {
      WILAYAS.forEach(function (name, i) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = (i + 1) + ' - ' + name;
        wilayaSelect.appendChild(opt);
      });
    }

    var qtyInput = document.getElementById('fQty');
    var qtyButtons = document.querySelectorAll('.qty__btn');
    var shipInputs = form.querySelectorAll('input[name="shipping"]');
    var sumQty = document.getElementById('sumQty');
    var sumProduct = document.getElementById('sumProduct');
    var sumShip = document.getElementById('sumShip');
    var sumTotal = document.getElementById('sumTotal');

    function dz(n) { return n.toLocaleString('en-US') + ' دج'; }

    function currentShipping() {
      var checked = form.querySelector('input[name="shipping"]:checked');
      return checked ? checked.value : 'home';
    }

    /* المقاس واللون اللي اختار — فارغ في المنتجات بلا خيارات */
    function selectedOptions() {
      var chosen = {};
      form.querySelectorAll('input[data-option]:checked').forEach(function (el) {
        chosen[el.dataset.option] = el.value;
      });
      return chosen;
    }

    /*
     * الفاريانت اللي يوافق الاختيار. نقارنو بالقيم ماشي بالـ sku — نفس
     * منطق matchVariant في catalog.mjs، باش السومة المعروضة تطابق اللي
     * يحسبها السيرفر.
     */
    function currentVariant() {
      if (!PRICING.options.length) return PRICING.variants[0] || null;
      var chosen = selectedOptions();
      for (var i = 0; i < PRICING.variants.length; i++) {
        var v = PRICING.variants[i];
        var match = PRICING.options.every(function (opt) {
          return v.options[opt.name] === chosen[opt.name];
        });
        if (match) return v;
      }
      return null;
    }

    function updateSummary() {
      var qty = Math.max(1, Math.min(10, parseInt(qtyInput.value, 10) || 1));
      qtyInput.value = qty;

      var shipKey = currentShipping();
      var shipCost = SHIPPING[shipKey];
      var variant = currentVariant();
      var unitPrice = Math.max(0, PRODUCT_PRICE + ((variant && variant.priceDelta) || 0));
      var productCost = unitPrice * qty;

      sumQty.textContent = '×' + qty;
      sumProduct.textContent = dz(productCost);
      sumShip.textContent = dz(shipCost);
      sumTotal.textContent = dz(productCost + shipCost);

      form.querySelectorAll('.ship__price').forEach(function (el) {
        el.textContent = dz(SHIPPING[el.dataset.price]);
      });
    }

    qtyButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var delta = parseInt(btn.dataset.qty, 10);
        var next = (parseInt(qtyInput.value, 10) || 1) + delta;
        qtyInput.value = Math.max(1, Math.min(10, next));
        updateSummary();
      });
    });
    shipInputs.forEach(function (el) { el.addEventListener('change', updateSummary); });
    /* تبديل المقاس/اللون يقدر يبدّل السومة (priceDelta) */
    form.querySelectorAll('input[data-option]').forEach(function (el) {
      el.addEventListener('change', updateSummary);
    });
    updateSummary();

    /* التحقّق من الحقول */
    var validators = {
      fName: function (v) { return v.trim().length >= 3 ? '' : 'دخّل الاسم الكامل من فضلك.'; },
      fPhone: function (v) {
        var digits = v.replace(/[^0-9]/g, '');
        return /^0[5-7][0-9]{8}$/.test(digits) ? '' : 'دخّل رقم هاتف صحيح (مثال: 0555123456).';
      },
      fWilaya: function (v) { return v ? '' : 'اختر الولاية.'; },
      fCommune: function (v) { return v.trim().length >= 2 ? '' : 'دخّل اسم البلدية.'; }
    };

    function showError(id, msg) {
      var input = document.getElementById(id);
      var errEl = form.querySelector('[data-err-for="' + id + '"]');
      var field = input.closest('.field');
      if (errEl) errEl.textContent = msg;
      if (field) field.classList.toggle('has-error', Boolean(msg));
    }

    function validateField(id) {
      var input = document.getElementById(id);
      var msg = validators[id](input.value);
      showError(id, msg);
      return !msg;
    }

    Object.keys(validators).forEach(function (id) {
      var input = document.getElementById(id);
      input.addEventListener('blur', function () { validateField(id); });
      input.addEventListener('input', function () {
        if (input.closest('.field').classList.contains('has-error')) validateField(id);
      });
    });

    var submitBtn = document.getElementById('submitBtn');
    var submitErr = document.getElementById('submitErr');
    var orderDone = document.getElementById('orderDone');
    var orderDoneMsg = document.getElementById('orderDoneMsg');
    var orderAgain = document.getElementById('orderAgain');

    /* الفنكشن اللي تبعث إشعار واتساب — الكود تاعها في netlify/functions/order.mjs */
    var ORDER_ENDPOINT = '/.netlify/functions/order';

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      /* معاينة اللوحة: الفورم يتعرض بالكامل باش تشوفو، بصح ما يبعث والو.
         الزرّ راهو disabled تاني — هذا باش حتى Enter ما يفوّتش. */
      if (form.hasAttribute('data-preview')) {
        submitErr.textContent = 'هذي معاينة — الطلب ما يتبعثش من هنا.';
        return;
      }

      submitErr.textContent = '';

      var ok = Object.keys(validators).reduce(function (acc, id) {
        return validateField(id) && acc;
      }, true);
      if (!ok) {
        var firstError = form.querySelector('.has-error input, .has-error select');
        if (firstError) firstError.focus();
        return;
      }

      var originalLabel = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.classList.add('is-loading');
      submitBtn.textContent = 'جارٍ التسجيل...';

      function restoreButton() {
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
        submitBtn.innerHTML = originalLabel;
      }

      var name = document.getElementById('fName').value.trim();
      var wilaya = document.getElementById('fWilaya').value;
      var total = document.getElementById('sumTotal').textContent;

      fetch(ORDER_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name,
          phone: document.getElementById('fPhone').value,
          wilaya: wilaya,
          commune: document.getElementById('fCommune').value.trim(),
          shipping: currentShipping(),
          qty: qtyInput.value,
          website: document.getElementById('fWebsite').value,
          attribution: attribution,
          /* واش راه يتطلب — السيرفر يجيب السومة من عندو بهذا، ما ياخذش
             حتى رقم من هنا */
          productId: PRICING.productId,
          campaignId: (form.querySelector('input[name="campaignId"]') || {}).value || null,
          options: selectedOptions()
        })
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) throw new Error(data.error || 'ما قدرناش نسجّلو الطلب دروك. عاود حاول.');
            return data;
          });
        })
        .then(function () {
          orderDoneMsg.textContent =
            'شكراً ' + name + '! تسجّل طلبك بـ ' + total + ' نحو ولاية ' + wilaya +
            '. راح يتّصل بيك فريقنا في أقرب وقت باش يأكّد الطلب.';

          form.hidden = true;
          orderDone.hidden = false;
          orderDone.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
          restoreButton();
        })
        .catch(function (err) {
          submitErr.textContent = err.message || 'ما قدرناش نسجّلو الطلب دروك. عاود حاول.';
          restoreButton();
          submitBtn.focus();
        });
    });

    if (orderAgain) {
      orderAgain.addEventListener('click', function () {
        form.reset();
        updateSummary();
        Object.keys(validators).forEach(function (id) { showError(id, ''); });
        form.hidden = false;
        orderDone.hidden = true;
        form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      });
    }
  }

  /* ── سنة الفوتر ────────────────────────────────────────────── */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
