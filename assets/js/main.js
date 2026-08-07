/* =============================================================
   Qiti — تفاعلات صفحة الهبوط
   جافاسكريبت عادي بلا أي مكتبة. إذا تعطّل الجافاسكريبت، المحتوى
   يبقى بايّن ومقروء، غير الأنيميشن والفورم اللي ما يخدموش.
   ============================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* ── ظل شريط التنقّل عند التمرير ──────────────────────────── */
  var nav = document.getElementById('nav');
  var onScroll = function () {
    nav.classList.toggle('is-stuck', window.scrollY > 12);
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
  var PRODUCT_PRICE = 3900;
  var SHIPPING = { home: 600, desk: 400 };
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
    var wilayaSelect = document.getElementById('fWilaya');
    WILAYAS.forEach(function (name, i) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = (i + 1) + ' - ' + name;
      wilayaSelect.appendChild(opt);
    });

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

    function updateSummary() {
      var qty = Math.max(1, Math.min(10, parseInt(qtyInput.value, 10) || 1));
      qtyInput.value = qty;

      var shipKey = currentShipping();
      var shipCost = SHIPPING[shipKey];
      var productCost = PRODUCT_PRICE * qty;

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
    var orderDone = document.getElementById('orderDone');
    var orderDoneMsg = document.getElementById('orderDoneMsg');
    var orderAgain = document.getElementById('orderAgain');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var ok = Object.keys(validators).reduce(function (acc, id) {
        return validateField(id) && acc;
      }, true);
      if (!ok) {
        var firstError = form.querySelector('.has-error input, .has-error select');
        if (firstError) firstError.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.classList.add('is-loading');
      var originalLabel = submitBtn.innerHTML;
      submitBtn.textContent = 'جارٍ التسجيل...';

      /*
       * ملاحظة للمطوّر: هذا نموذج واجهة أمامية فقط (بلا سيرفر).
       * باش يخدم بشكل حقيقي، بدّل هذا الجزء بـ fetch() يبعث لـ
       * API تاعك، أو Google Sheet، أو مباشرة لخدمة زبائن عبر واتساب.
       */
      window.setTimeout(function () {
        var name = document.getElementById('fName').value.trim();
        var wilaya = document.getElementById('fWilaya').value;
        var total = document.getElementById('sumTotal').textContent;

        orderDoneMsg.textContent =
          'شكراً ' + name + '! تسجّل طلبك بـ ' + total + ' نحو ولاية ' + wilaya +
          '. راح يتّصل بيك فريقنا في أقرب وقت باش يأكّد الطلب.';

        form.hidden = true;
        orderDone.hidden = false;
        orderDone.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });

        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
        submitBtn.innerHTML = originalLabel;
      }, 700);
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
