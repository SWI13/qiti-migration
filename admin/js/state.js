
export var state = {
  authed: false,
  view: 'campaigns',
  id: null,
  campaigns: [],
  /* إعدادات المتجر — تتقرا غير في صفحة البيكسلات دروك، فتبقى null
     حتى تحلّها بدل ما نجيبوها في كل تحميل */
  settings: null,
  products: [],
  categories: [],
  media: [],
  orders: [],
  leads: [],
  pendingOrders: 0,
  /* صفّ المكالمات: السطور، عدّاد كل حالة، والرقم اللي يبان في البادج
     (اللي يستنّى دروك — بلا اللي عندو موعد في المستقبل) */
  queue: [],
  queueCounts: null,
  queueDue: 0,
  dashboard: null,
  /* السجلّ: صفحة وحدة كيما جاءت من السيرفر (rows/total/pages)،
     والملخّص منفصل باش ما يتعاودش يتحسب مع كل تبديل فلتر */
  logs: null,
  logsSummary: null,
  dashboardDays: 30,
  draft: null,
  product: null,
  stock: [],
  viewport: 'mobile',
};
