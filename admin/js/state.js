
export var state = {
  authed: false,
  view: 'campaigns',
  id: null,
  campaigns: [],
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
  dashboardDays: 30,
  draft: null,
  product: null,
  stock: [],
  viewport: 'mobile',
};
