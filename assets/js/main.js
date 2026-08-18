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

  /* ── ظل شريط التنقّل + زر "اطلب الان" العائم ───────────────────────
     الزر يبان كي ينزل الزائر بالسكرول (فوق، الـ hero عندو زوج أزرار
     أصلاً)، **ويختفي كي يقرب قسم الطلب**.

     علاش يختفي: كي يكون الفورم قدّامو، الزر العائم ما بقاش يخدم —
     يغطّي الحقول في الموبايل، وكي يكليكي فيه بالغلط يرجّعو للفورم
     اللي راه فيه أصلاً. زر يعاود يوديك لبلاصتك = زر خاسر. */
  var nav = document.getElementById('nav');
  var floatingCta = document.querySelector('.floating-cta');
  var orderZone = document.getElementById('order') || document.getElementById('orderForm');
  var floatThreshold = window.innerHeight * 0.6;
  var orderNear = false;          /* واش قسم الطلب قريب ولا بايّن */

  window.addEventListener('resize', function () {
    floatThreshold = window.innerHeight * 0.6;
  }, { passive: true });

  function updateFloatingCta() {
    if (!floatingCta) return;
    floatingCta.classList.toggle('is-visible', window.scrollY > floatThreshold && !orderNear);
  }

  /*
   * نعتبروه "قريب" حتى قبل ما يوصل: نكبّرو صندوق المراقبة بـ 25% من طول
   * الشاشة تحت، باش الزر يختفي قبل ما الفورم يلحق تحت الإبهام، ماشي في
   * نفس اللحظة.
   */
  if (orderZone && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      orderNear = entries[0].isIntersecting;
      updateFloatingCta();
    }, { rootMargin: '0px 0px 25% 0px' }).observe(orderZone);
  }

  var onScroll = function () {
    nav.classList.toggle('is-stuck', window.scrollY > 12);
    /* متصفّح قديم بلا IntersectionObserver — نحسبوها بالمسطرة */
    if (orderZone && !('IntersectionObserver' in window)) {
      var box = orderZone.getBoundingClientRect();
      orderNear = box.top < window.innerHeight * 1.25 && box.bottom > 0;
    }
    updateFloatingCta();
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

  /*
   * ── تسعيرة التوصيل حسب الولاية ────────────────────────────────────
   *
   * الجدول يجي من وسم JSON كتبو السيرفر (lib/shipping-rates.mjs):
   * الصفحات المعروضة تكتبو مع الصفحة، والصفحة الستاتيك تاخذو محقون في
   * scripts/build.mjs. ما نعاودوش نكتبو 58 ولاية هنا — نفس التحذير
   * تاع WILAYAS تحت، وهذا الجدول يتبدّل أكثر منها بزاف.
   *
   * الوسم ناقص (صفحة قديمة) = نرجعو للتسعيرة الوحدة. الفورم يبقى
   * خدّام بسومة معقولة بدل ما يوقف.
   */
  var RATES = (function () {
    var fallback = { def: SHIPPING, byId: {}, table: null };
    var el = document.getElementById('qiti-shipping-rates');
    if (!el) return fallback;
    try {
      var parsed = JSON.parse(el.textContent);
      var byId = {};
      (parsed.table || []).forEach(function (row) { byId[row.id] = row; });
      return { def: parsed['default'] || SHIPPING, byId: byId, table: parsed.table || null };
    } catch (e) {
      return fallback;   /* JSON مهرّس ما يوقّفش الفورم */
    }
  })();

  /* desk = null معناها ما كاينش مكتب في هذي الولاية — نرجعو لسومة الدار */
  function rateFee(rate, mode) {
    if (!rate) return null;
    if (mode === 'desk') return rate.desk == null ? rate.home : rate.desk;
    return rate.home;
  }

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
        /* الرقم الرسمي — بيه نلقاو سطر التسعيرة بلا ما نقارنو أسماء
           عربية حرف بحرف (صيغة وحدة تختلف = سومة غالطة) */
        opt.dataset.id = i + 1;
        wilayaSelect.appendChild(opt);
      });
    }

    var cartTotal = 0;
    var qtyInput = document.getElementById('fQty');
    var qtyButtons = document.querySelectorAll('.qty__btn');
    var shipInputs = form.querySelectorAll('input[name="shipping"]');
    var shipHint = document.getElementById('shipHint');
    var ratesBox = document.getElementById('shipRates');
    var sumQty = document.getElementById('sumQty');
    var sumProduct = document.getElementById('sumProduct');
    var sumShip = document.getElementById('sumShip');
    var sumTotal = document.getElementById('sumTotal');

    function dz(n) { return n.toLocaleString('en-US') + ' دج'; }

    /* رقم الولاية المختارة، ولا 0 إذا مازال ما اختارش */
    function currentWilayaId() {
      if (!wilayaSelect.value) return 0;
      var opt = wilayaSelect.options[wilayaSelect.selectedIndex];
      return parseInt((opt && opt.dataset.id) || wilayaSelect.selectedIndex, 10) || 0;
    }

    /* null = مازال ما اختار ولاية. السومة ما تتخمّنش — تبان "—" حتى
       يختار، خير من رقم يتبدّل قدّامو من بعد. */
    function currentRate() {
      var id = currentWilayaId();
      if (!id) return null;
      return RATES.byId[id] || RATES.def;
    }

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

      var rate = currentRate();

      /* ولاية بلا مكتب DHD: نعميو الخيار قبل ما نقراو الاختيار، وإلا
         نحسبو بسومة مكتب ما كاينش. السيرفر يدير نفس الحاجة في
         api/order.mjs — الصفحة ما تتحكمش وحدها في الفلوس. */
      var deskInput = form.querySelector('input[name="shipping"][value="desk"]');
      if (deskInput) {
        var deskOff = Boolean(rate) && rate.desk == null;
        deskInput.disabled = deskOff;
        var deskLabel = deskInput.closest('.ship');
        if (deskLabel) deskLabel.classList.toggle('ship--off', deskOff);
        if (deskOff && deskInput.checked) {
          var homeInput = form.querySelector('input[name="shipping"][value="home"]');
          if (homeInput) homeInput.checked = true;
        }
      }

      var shipKey = currentShipping();
      var shipCost = rateFee(rate, shipKey);
      var variant = currentVariant();
      var unitPrice = Math.max(0, PRODUCT_PRICE + ((variant && variant.priceDelta) || 0));
      var productCost = unitPrice * qty;

      sumQty.textContent = '×' + qty;
      sumProduct.textContent = dz(productCost);
      sumShip.textContent = shipCost === null ? '—' : dz(shipCost);
      sumTotal.textContent = dz(productCost + (shipCost || 0));
      /* نخبّيوها باش الـ lead يعرف واش كان في السلّة كي حبس */
      cartTotal = productCost + (shipCost || 0);

      if (shipHint) shipHint.hidden = Boolean(rate);

      form.querySelectorAll('.ship__price').forEach(function (el) {
        var mode = el.dataset.price;
        if (!rate) { el.textContent = '—'; return; }
        if (mode === 'desk' && rate.desk == null) { el.textContent = 'ما كاينش'; return; }
        el.textContent = dz(rateFee(rate, mode));
      });

      highlightRate(currentWilayaId());
    }

    /*
     * جدول التوصيل لكل ولاية — الزبون يشوف سومتو قبل ما يعمّر حتى حقل،
     * وهذا سؤال رقم واحد في الرسائل. يتبنى في المتصفّح من نفس وسم
     * JSON: 58 سطر مكتوبين في كل صفحة معروضة وزن بلا فايدة، وأغلب
     * الناس ما يحلّوش الجدول أصلاً.
     */
    (function buildRateTable() {
      if (!ratesBox || !RATES.table) return;
      var body = ratesBox.querySelector('.ship-rates__body');
      if (!body) return;

      var table = document.createElement('table');
      table.className = 'rate-table';

      var head = document.createElement('tr');
      ['الولاية', 'للدار', 'للمكتب'].forEach(function (label) {
        var th = document.createElement('th');
        th.textContent = label;
        head.appendChild(th);
      });
      table.appendChild(head);

      RATES.table.forEach(function (row) {
        var tr = document.createElement('tr');
        tr.setAttribute('data-wilaya', row.id);
        [
          row.id + ' - ' + row.name,
          dz(row.home),
          row.desk == null ? 'ما كاينش' : dz(row.desk)
        ].forEach(function (text) {
          var td = document.createElement('td');
          td.textContent = text;   /* ماشي innerHTML — نص يدخل في DOM بلا تفسير */
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });

      body.appendChild(table);
      ratesBox.hidden = false;
    })();

    /* سطر الولاية المختارة يتنوّر — الجدول طويل، بلا هذا لازم تقلّب فيه */
    function highlightRate(id) {
      if (!ratesBox) return;
      ratesBox.querySelectorAll('tr[data-wilaya]').forEach(function (tr) {
        tr.classList.toggle('is-on', Number(tr.getAttribute('data-wilaya')) === id);
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
    /* تبديل الولاية يبدّل سومة التوصيل — هذا هو بيت القصيد كامل */
    wilayaSelect.addEventListener('change', updateSummary);
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

    /* ── التقاط الطلب قبل ما يكمّل ─────────────────────────────────
     *
     * الطلب ما يوجد حتى ينقر "أكّد". الواحد يكتب اسمو ورقمو، يتلهّى،
     * ويسكّر — ومن ناحيتنا ما صرا والو. هنا نبعثو اللي عمّرو ساعة ما
     * الرقم يولّي صحيح، وكل ما يتبدّل حقل من بعدها.
     *
     * ثلاث حاجات تخلّي هذا ما يزعجش:
     *   • نستنّاو سكوت 900 ملّي قبل ما نبعثو — ماشي على كل حرف.
     *   • ما نبعثوش إذا والو ما تبدّل من آخر مرّة.
     *   • كي يسكّر الصفحة فجأة، sendBeacon يبعث آخر نسخة — هي بالضبط
     *     اللحظة اللي كنّا نخسّرو فيها الزبون قبل.
     *
     * ── وقتاش يوصل الإشعار ─────────────────────────────────────────
     * الحفظ وحدو ما يحرّكش تيليغرام. الرسالة تتبعث غير كي نبعثو إشارة:
     *
     *   idle    — سكت LEAD_IDLE_MS بلا ما يمسّ حتى حقل
     *   leaving — خرج من الصفحة (سكّرها ولا بدّل تطبيق)
     *
     * علاش الصفحة هي السّاعة وماشي السيرفر: الفنكشنات serverless ما
     * تقدرش تستنّى، وكرون كل دقيقة ما يتقبلش في خطّة Hobby. المتصفّح
     * راهو محلول قدّام الزبون — هو أصدق مكان يقيس منّو السكوت.
     *
     * الزبون العادي ياخذ دقيقتين-ثلاثة باش يعمّر (يقرا، يسأل على
     * العنوان، يعاود يشوف السومة) — وهذا ماشي "ما كملش".
     */
    var LEAD_ENDPOINT = '/api/lead';
    var LEAD_DEBOUNCE_MS = 900;
    var LEAD_IDLE_MS = 120000;   /* دقيقتين — نفس NOTIFY_AFTER_SECONDS في السيرفر */
    var leadTimer = null;
    var leadIdleTimer = null;
    var leadLastSent = '';       /* آخر نسخة تبعثت — نقارنو بيها بلا ما نعاودو */
    var leadLastPhone = null;    /* الرقم القديم، باش السيرفر يمسح lead الغلط */
    var leadDone = false;        /* الطلب كمّل — ما بقاش يلزم التقاط */

    function leadSnapshot() {
      var phone = document.getElementById('fPhone').value.replace(/[^0-9]/g, '');
      if (!/^0[5-7][0-9]{8}$/.test(phone)) return null;   /* ما زال يكتب */

      return {
        name: document.getElementById('fName').value.trim(),
        phone: phone,
        previousPhone: leadLastPhone,
        wilaya: document.getElementById('fWilaya').value,
        commune: document.getElementById('fCommune').value.trim(),
        shipping: currentShipping(),
        qty: qtyInput.value,
        cartTotal: cartTotal,
        website: document.getElementById('fWebsite').value,
        attribution: attribution,
        productId: PRICING.productId,
        campaignId: (form.querySelector('input[name="campaignId"]') || {}).value || null,
        options: selectedOptions()
      };
    }

    /*
     * opts.beacon  — الصفحة راهي تسكّر، fetch عادي يتلغى معاها
     * opts.idle    — سكت دقيقتين: السيرفر يقدر يبعث الإشعار
     * opts.leaving — خرج من الصفحة: السيرفر يبعث بلا ما يحسب الوقت
     */
    function sendLead(opts) {
      if (leadDone || form.hasAttribute('data-preview')) return;
      opts = opts || {};

      var snapshot = leadSnapshot();
      if (!snapshot) return;

      /* نقارنو بلا previousPhone — هو معلومة تخصّ البعث، ماشي المحتوى */
      var fingerprint = JSON.stringify(snapshot, function (key, value) {
        return key === 'previousPhone' ? undefined : value;
      });
      /* الإشارات تعدّي حتى لو والو ما تبدّل — هي روحها الخبر */
      var signalling = Boolean(opts.idle || opts.leaving);
      if (!signalling && fingerprint === leadLastSent) return;

      snapshot.idle = Boolean(opts.idle);
      snapshot.leaving = Boolean(opts.leaving);

      var body = JSON.stringify(snapshot);
      leadLastSent = fingerprint;
      leadLastPhone = snapshot.phone;

      if (opts.beacon && navigator.sendBeacon) {
        navigator.sendBeacon(LEAD_ENDPOINT, new Blob([body], { type: 'application/json' }));
        return;
      }

      fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body,
        keepalive: true
      }).catch(function () {
        /* الالتقاط ثانوي — إذا فشل، الفورم يكمّل خدمتو عادي.
           نصفّرو باش المحاولة الجاية تعاود تبعث نفس النسخة. */
        leadLastSent = '';
      });
    }

    /* كل حركة في الفورم تصفّر السّاعة — الدقيقتين تتحسبو من آخر لمسة */
    function restartIdleClock() {
      clearTimeout(leadIdleTimer);
      if (leadDone) return;
      leadIdleTimer = setTimeout(function () {
        sendLead({ idle: true });
      }, LEAD_IDLE_MS);
    }

    function scheduleLead() {
      if (leadDone) return;
      clearTimeout(leadTimer);
      leadTimer = setTimeout(function () { sendLead({}); }, LEAD_DEBOUNCE_MS);
      restartIdleClock();
    }

    form.addEventListener('input', scheduleLead);
    form.addEventListener('change', scheduleLead);
    /* الخروج من خانة الرقم = قرار، ماشي كتابة — نحفظو دروك بلا انتظار.
       الحفظ برك: الإشعار ما زال يستنّى السكوت ولا الخروج. */
    document.getElementById('fPhone').addEventListener('blur', function () {
      clearTimeout(leadTimer);
      sendLead({});
      restartIdleClock();
    });

    /*
     * pagehide يشمل السكّر، الرجوع لور، وتبديل التطبيق في الموبايل.
     * visibilitychange يزيدها في iOS اللي ما يرميش pagehide ديما.
     *
     * ⚠️ تبديل تطبيق ماشي ديما "مشا" — يقدر يروح يشوف العنوان ويرجع.
     * ما يضرّش: إذا رجع وكمّل، رسالة الـ lead روحها تولّي "كمّل الطلب".
     */
    window.addEventListener('pagehide', function () { sendLead({ beacon: true, leaving: true }); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') sendLead({ beacon: true, leaving: true });
    });

    var submitBtn = document.getElementById('submitBtn');
    var submitErr = document.getElementById('submitErr');
    var orderDone = document.getElementById('orderDone');
    var orderDoneMsg = document.getElementById('orderDoneMsg');
    var orderAgain = document.getElementById('orderAgain');

    /* الفنكشن اللي تبعث إشعار واتساب — الكود تاعها في api/order.mjs */
    var ORDER_ENDPOINT = '/api/order';

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
          /* كمّل — السيرفر علّم الـ lead `converted` وحدو، وحنا نحبسو
             الالتقاط باش beacon تاع السكّر ما يعاودش يبعثو */
          leadDone = true;
          clearTimeout(leadTimer);
          clearTimeout(leadIdleTimer);

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
