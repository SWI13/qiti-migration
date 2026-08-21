import { COMMON_EN } from './strings/common.en.js';
import { NAV_EN } from './strings/nav.en.js';
import { LOGIN_EN } from './strings/login.en.js';
import { CAMPAIGNS_EN } from './strings/campaigns.en.js';
import { PRODUCTS_EN } from './strings/products.en.js';
import { CATEGORIES_EN } from './strings/categories.en.js';
import { MEDIA_EN } from './strings/media.en.js';
import { ORDERS_EN } from './strings/orders.en.js';
import { QUEUE_EN } from './strings/queue.en.js';
import { DASHBOARD_EN } from './strings/dashboard.en.js';
import { STATE_EN } from './strings/state.en.js';
import { LOGS_EN } from './strings/logs.en.js';
import { PIXELS_EN } from './strings/pixels.en.js';

var STRINGS_EN = Object.assign(
  {},
  COMMON_EN, NAV_EN, LOGIN_EN,
  CAMPAIGNS_EN, PRODUCTS_EN, CATEGORIES_EN, MEDIA_EN,
  ORDERS_EN, QUEUE_EN, DASHBOARD_EN, STATE_EN, LOGS_EN, PIXELS_EN,
);

export function t(key, vars) {
  var str = STRINGS_EN[key];
  if (str == null) return key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, function (match, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match;
  });
}
