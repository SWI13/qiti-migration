(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ATTRIBUTION_KEY = 'qiti-attribution';
  var ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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
      if (Date.now() - saved.landedAt > ATTRIBUTION_TTL_MS) return null;
      return saved;
    } catch (e) {
      return null;
    }
  }

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

  var stickyBar = document.getElementById('stickyBar');
  var orderCard = document.getElementById('order');
  if (stickyBar && orderCard && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      stickyBar.classList.toggle('is-hidden', entries[0].isIntersecting);
    }, { threshold: 0.12 }).observe(orderCard);
  }

  var mapDist = document.getElementById('mapDist');
  if (mapDist && !reduceMotion) {
    var walked = 340;
    window.setInterval(function () {
      walked = Math.max(120, Math.min(480, walked + Math.round((Math.random() - 0.45) * 30)));
      mapDist.textContent = walked + ' م';
    }, 3000);
  }

  var shots = document.getElementById('shots');
  var dots = document.getElementById('dots');
  if (shots && dots && dots.children.length) {
    var syncDot = function () {
      var index = Math.round(shots.scrollLeft / shots.clientWidth);
      index = Math.min(dots.children.length - 1, Math.abs(index));
      for (var i = 0; i < dots.children.length; i++) {
        dots.children[i].classList.toggle('is-on', i === index);
      }
    };
    shots.addEventListener('scroll', function () {
      window.clearTimeout(shots._dotTimer);
      shots._dotTimer = window.setTimeout(syncDot, 60);
    }, { passive: true });
  }

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
      return fallback;
    }
  })();

  var PRODUCT_PRICE = PRICING.price;
  var SHIPPING = PRICING.shipping;

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
      return fallback;
    }
  })();

  function rateFee(rate, mode) {
    if (!rate || rate.home === null) return null;
    if (mode === 'desk') return rate.desk == null ? rate.home : rate.desk;
    return rate.home;
  }

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
    if (wilayaSelect.options.length <= 1) {
      WILAYAS.forEach(function (name, i) {
        var opt = document.createElement('option');
        opt.value = name;
        var served = !RATES.byId[i + 1] || RATES.byId[i + 1].home !== null;
        opt.textContent = (i + 1) + ' - ' + name + (served ? '' : ' — ما نوصلوش');
        opt.disabled = !served;
        opt.dataset.id = i + 1;
        wilayaSelect.appendChild(opt);
      });
    }

    var cartTotal = 0;
    var qtyInput = document.getElementById('fQty');
    var qtyButtons = document.querySelectorAll('.qty__btn');
    var shipInputs = form.querySelectorAll('input[name="shipping"]');
    var shipHint = document.getElementById('shipHint');
    var etaLine = document.getElementById('etaLine');
    var progFill = document.getElementById('progFill');
    var progTxt = document.getElementById('progTxt');
    var sumQty = document.getElementById('sumQty');
    var sumProduct = document.getElementById('sumProduct');
    var sumShip = document.getElementById('sumShip');
    var sumTotal = document.getElementById('sumTotal');

    function dz(n) { return n.toLocaleString('en-US') + ' دج'; }

    function currentWilayaId() {
      if (!wilayaSelect.value) return 0;
      var opt = wilayaSelect.options[wilayaSelect.selectedIndex];
      return parseInt((opt && opt.dataset.id) || wilayaSelect.selectedIndex, 10) || 0;
    }

    function currentRate() {
      var id = currentWilayaId();
      if (!id) return null;
      return RATES.byId[id] || RATES.def;
    }

    function currentShipping() {
      var checked = form.querySelector('input[name="shipping"]:checked');
      return checked ? checked.value : 'home';
    }

    function selectedOptions() {
      var chosen = {};
      form.querySelectorAll('input[data-option]:checked').forEach(function (el) {
        chosen[el.dataset.option] = el.value;
      });
      return chosen;
    }

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

      var deskInput = form.querySelector('input[name="shipping"][value="desk"]');
      if (deskInput) {
        var deskOff = Boolean(rate) && rate.desk == null;
        deskInput.disabled = deskOff;
        var deskLabel = deskInput.closest('.pick');
        if (deskLabel) deskLabel.classList.toggle('pick--off', deskOff);
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
      var nextTotal = dz(productCost + (shipCost || 0));
      if (sumTotal.textContent !== nextTotal && !reduceMotion) {
        sumTotal.classList.remove('flash');
        void sumTotal.offsetWidth;
        sumTotal.classList.add('flash');
      }
      sumTotal.textContent = nextTotal;
      cartTotal = productCost + (shipCost || 0);

      if (shipHint) shipHint.hidden = Boolean(rate);

      if (etaLine) {
        if (rate && rate.eta && shipCost !== null) {
          etaLine.textContent = 'يوصلك تقريباً في ' + rate.eta.min + '-' + rate.eta.max
            + ' أيام · التوصيل ' + dz(shipCost);
          etaLine.hidden = false;
        } else {
          etaLine.hidden = true;
        }
      }

      updateProgress();

      form.querySelectorAll('.pick__price').forEach(function (el) {
        var mode = el.dataset.price;
        if (!rate) { el.textContent = '—'; return; }
        if (rate.home === null) { el.textContent = 'ما نوصلوش'; return; }
        if (mode === 'desk' && rate.desk == null) { el.textContent = 'ما كاينش'; return; }
        el.textContent = dz(rateFee(rate, mode));
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
    wilayaSelect.addEventListener('change', updateSummary);
    form.querySelectorAll('input[data-option]').forEach(function (el) {
      el.addEventListener('change', updateSummary);
    });
    updateSummary();

    var validators = {
      fName: function (v) { return v.trim().length >= 3 ? '' : 'دخّل الاسم الكامل من فضلك.'; },
      fPhone: function (v) {
        var digits = v.replace(/[^0-9]/g, '');
        return /^0[5-7][0-9]{8}$/.test(digits) ? '' : 'دخّل رقم هاتف صحيح (مثال: 0555123456).';
      },
      fWilaya: function (v) { return v ? '' : 'اختر الولاية.'; },
      fCommune: function (v) { return v.trim().length >= 2 ? '' : 'دخّل اسم البلدية.'; }
    };

    var PROG_FIELDS = ['fName', 'fPhone', 'fWilaya', 'fCommune'];
    function updateProgress() {
      if (!progFill || !validators) return;
      var done = PROG_FIELDS.filter(function (id) {
        var input = document.getElementById(id);
        return input && input.value && !validators[id](input.value);
      }).length;
      progFill.style.width = (25 + (done / PROG_FIELDS.length) * 75) + '%';
      if (!progTxt) return;
      var left = PROG_FIELDS.length - done;
      progTxt.textContent = left === 0
        ? 'كلش جاهز ✓ — اضغط اطلب الآن'
        : (left === 1 ? 'باقي معلومة وحدة برك' : 'باقي ' + left + ' معلومات');
    }

    function showError(id, msg) {
      var input = document.getElementById(id);
      var errEl = form.querySelector('[data-err-for="' + id + '"]');
      var field = input.closest('.field');
      if (errEl) errEl.textContent = msg;
      if (field) {
        field.classList.toggle('has-error', Boolean(msg));
        field.classList.toggle('is-ok', !msg && Boolean(input.value));
      }
      updateProgress();
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
        updateProgress();
      });
      input.addEventListener('change', updateProgress);
    });

    var LEAD_ENDPOINT = '/api/lead';
    var LEAD_DEBOUNCE_MS = 900;
    var LEAD_IDLE_MS = 120000;
    var leadTimer = null;
    var leadIdleTimer = null;
    var leadLastSent = '';
    var leadLastPhone = null;
    var leadDone = false;

    function leadSnapshot() {
      var phone = document.getElementById('fPhone').value.replace(/[^0-9]/g, '');
      if (!/^0[5-7][0-9]{8}$/.test(phone)) return null;

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

    function sendLead(opts) {
      if (leadDone || form.hasAttribute('data-preview')) return;
      opts = opts || {};

      var snapshot = leadSnapshot();
      if (!snapshot) return;

      var fingerprint = JSON.stringify(snapshot, function (key, value) {
        return key === 'previousPhone' ? undefined : value;
      });
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
        leadLastSent = '';
      });
    }

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
    document.getElementById('fPhone').addEventListener('blur', function () {
      clearTimeout(leadTimer);
      sendLead({});
      restartIdleClock();
    });

    window.addEventListener('pagehide', function () { sendLead({ beacon: true, leaving: true }); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') sendLead({ beacon: true, leaving: true });
    });

    var submitBtn = document.getElementById('submitBtn');
    var submitErr = document.getElementById('submitErr');
    var orderDone = document.getElementById('orderDone');
    var orderDoneMsg = document.getElementById('orderDoneMsg');
    var orderAgain = document.getElementById('orderAgain');

    var ORDER_ENDPOINT = '/api/order';

    form.addEventListener('submit', function (e) {
      e.preventDefault();

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
        .then(function (data) {
          leadDone = true;
          clearTimeout(leadTimer);
          clearTimeout(leadIdleTimer);

          var orderDoneId = document.getElementById('orderDoneId');
          if (orderDoneId && data && data.id) {
            orderDoneId.textContent = 'رقم الطلب: ' + data.id;
            orderDoneId.hidden = false;
          }

          orderDoneMsg.textContent =
            'شكراً ' + name + '! تسجّل طلبك بـ ' + total + ' نحو ولاية ' + wilaya +
            '. نتصلو بيك باش نأكّدو، وما تخلّص والو حتى يوصلك.';

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

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
