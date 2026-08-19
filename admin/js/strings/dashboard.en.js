
export var DASHBOARD_EN = {
  'dashboard.title': 'Dashboard',
  'dashboard.range7': 'Last 7 days',
  'dashboard.range30': 'Last 30 days',
  'dashboard.range90': 'Last 90 days',
  'dashboard.revenue': 'Revenue',
  'dashboard.revenueHint': 'Delivered orders only',
  'dashboard.profit': 'Net profit',
  'dashboard.profitHint': 'After cost, ads and returns',
  'dashboard.revenueWaiting': '{n} order(s) in transit — revenue counts only once you mark 📦 Delivered in Telegram',
  'dashboard.orders': 'Orders',
  'dashboard.ordersSub': '{delivered} delivered · {pending} pending',
  'dashboard.campaignStats': '{visits} visits · {orders} orders · {conv}',
  'dashboard.rangeAriaLabel': 'Date range',
  'dashboard.conversion': 'Conversion',
  'dashboard.aov': 'Avg. order value',
  'dashboard.productsSold': 'Products sold',
  'dashboard.visits': 'Visits',
  'dashboard.customers': 'Customers',
  'dashboard.trackingSince': 'Since {date}',
  'dashboard.noVisitData': 'No visit data yet',
  'dashboard.revenueChart': 'Revenue',
  'dashboard.pipeline': 'In transit',
  'dashboard.ordersChart': 'Orders placed',
  'dashboard.byCategory': 'Sales by category',
  'dashboard.topProducts': 'Top products',
  'dashboard.units': '{n} sold',
  'dashboard.activeCampaigns': 'Active campaigns',
  'dashboard.offersTitle': 'Bundles & upsells',
  'dashboard.bundleOrders': 'Bundle orders',
  'dashboard.bundleUnits': '{units} bundles sold',
  'dashboard.upsellConversion': 'Upsell conversion',
  'dashboard.upsellAccepted': '{accepted} accepted of {offers} offered',
  'dashboard.upsellRevenue': 'Upsell revenue',
  'dashboard.upsellPerOrder': '{amount} per delivered order',
  'dashboard.lowStock': 'Low stock',

  /*
   * ── مفردات "واش يستنّاك" ─────────────────────────────────────────
   * كل سطر يقول **فعل**، ماشي حالة: "waiting for confirmation" ماشي
   * "pending". المشغّل يقرا السطر ويعرف واش يدير بلا ما يترجم.
   */
  'action.title': 'Needs your attention',
  'action.pendingDecision': 'Orders waiting for confirmation',
  'action.unnotified': 'Orders that never reached Telegram',
  'action.shipmentFailed': 'Shipments the carrier rejected',
  'action.awaitingReturn': 'Returns not yet back in the shop',
  'action.oversold': 'Products promised beyond stock',
  'action.outOfStock': 'Products out of stock',
  'action.lowStock': 'Products low on stock',

  /*
   * ⚠️ "Available" ماشي "Quantity": الكمية هي اللي في الرفّ، والمتوفّر
   * هو اللي تقدر تبيعو دروك (ناقص اللي وعدت بيه في طلبات ما تقرّرش
   * فيها). خلط الزوج هو اللي يخلّي القبول يتردّ بعد ما تكون قلتي
   * للزبونة "خدّامة".
   */
  /*
   * المزامنة. النصّ يقول واش صرا فعلاً، ماشي "تمّ" — المشغّل ينقر باش
   * يعرف واش تبدّل، والجواب "نجح" ما يقول والو.
   */
  'sync.button': 'Sync carrier',
  'sync.running': 'Syncing…',
  'sync.moved': '{changed} parcel(s) moved · {outcomes} closed',
  'sync.quiet': 'Checked {checked} parcel(s) — nothing changed',

  'stock.availableTitle': 'Available to promise',
  'stock.onHandCommitted': '{onHand} on hand · {committed} reserved for pending orders',
  'dashboard.recentOrders': 'Recent orders',
  /* الطلبات اللي جات من الصفحة الستاتيك قبل ما يولّي الطوق منتج
     حقيقي — الاسم يبان كيما هو دروك، وهذا يبقى للطلبات القديمة */
  'dashboard.legacyProduct': 'Qiti Collar',
  'dashboard.uncategorized': 'Uncategorized',
  'dashboard.legacyStock': 'Qiti Collar (old counter)',
  'dashboard.emptyTitle': 'No activity yet',
  'dashboard.emptyBody': 'Orders and visits will show up here once your store starts getting traffic.',
  'dashboard.noDataTitle': 'Nothing here yet',
  'dashboard.viewAll': 'View all',
};
