/**
 * The Fairy Tails — Staff Order List
 * Google Apps Script backend
 */

const SHEET_ID = '1OoNBrlhogrfRobAfHhDAA1QsAwDIzEinvCu3TzEvAQE';

const SHEET_NAME = 'Staff Orders';
const HEADERS = [
  'Order ID', 'Date Added', 'Item Name', 'Category', 'Quantity',
  'Notes', 'Added By', 'Status', 'Ordered Date', 'Ordered By'
];
const CATEGORIES = [
  'Dog Grooming', 'Dog Training', 'Dog Boarding',
  'Doggy Daycare', 'Miscellaneous'
];

function doGet(e) {
  try {
    e = e || {};
    const params = e.parameter || {};
    if (params.app === '1') {
      ensureSheet_();
      return HtmlService.createHtmlOutputFromFile('index')
        .setTitle('Fairy Tails — Orders')
        .addMetaTag('viewport',
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    if (params.action) {
      return jsonOut_(dispatch_(params.action, parseMaybeJson_(params.params)));
    }
    return jsonOut_({
      ok: true,
      message: 'Fairy Tails Order API is live. POST { action, params } here.'
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    let body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); }
      catch (parseErr) {
        return jsonOut_({ ok: false, error: 'Invalid JSON body' });
      }
    } else if (e && e.parameter && e.parameter.action) {
      body = { action: e.parameter.action,
               params: parseMaybeJson_(e.parameter.params) };
    }
    return jsonOut_(dispatch_(body.action, body.params || {}));
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseMaybeJson_(s) {
  if (s == null) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(String(s)); } catch (e) { return {}; }
}

function dispatch_(action, params) {
  params = params || {};
  try {
    switch (action) {
      case 'getOrders':    return getOrders();
      case 'addOrder':     return addOrder(params);
      case 'markOrdered':  return markOrdered(params.orderId, params.initials);
      case 'undoOrdered':  return undoOrdered(params.orderId);
      case 'reAddOrder':   return reAddOrder(params.orderId, params.addedBy);
      default:             return { ok: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

function getSpreadsheet_() {
  if (SHEET_ID) {
    return SpreadsheetApp.openById(SHEET_ID);
  }
  const ss = SpreadsheetApp.getActive();
  if (!ss) {
    throw new Error(
      'No spreadsheet found. Paste your Sheet ID into the SHEET_ID constant ' +
      'at the top of Code.gs and redeploy.'
    );
  }
  return ss;
}

function ensureSheet_() {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setValues([HEADERS])
      .setFontWeight('bold')
      .setBackground('#e9f7fc');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, HEADERS.length, 140);
  } else {
    const first = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    if (first.join('|') !== HEADERS.join('|')) {
      sh.getRange(1, 1, 1, HEADERS.length)
        .setValues([HEADERS])
        .setFontWeight('bold')
        .setBackground('#e9f7fc');
    }
  }
  return sh;
}

function rowToObj_(row) {
  return {
    orderId:     row[0],
    dateAdded:   row[1] instanceof Date ? row[1].toISOString() : row[1],
    itemName:    row[2],
    category:    row[3],
    quantity:    row[4] === '' ? null : row[4],
    notes:       row[5],
    addedBy:     row[6],
    status:      row[7],
    orderedDate: row[8] instanceof Date ? row[8].toISOString() : row[8],
    orderedBy:   row[9]
  };
}

function findRowById_(sh, orderId) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === orderId) return i + 2;
  }
  return -1;
}

function newId_() {
  return 'ord_' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

function sanitiseInitials_(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

function sanitiseCategory_(s) {
  return CATEGORIES.indexOf(s) === -1 ? 'Miscellaneous' : s;
}

function getOrders() {
  const sh = ensureSheet_();
  const last = sh.getLastRow();
  const out = { active: [], recent: [], categories: CATEGORIES.slice() };
  if (last < 2) return { ok: true, active: [], recent: [], categories: CATEGORIES.slice() };
  const data = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (let i = 0; i < data.length; i++) {
    const o = rowToObj_(data[i]);
    if (o.status === 'Active') out.active.push(o);
    else if (o.status === 'Ordered' && o.orderedDate) {
      const t = new Date(o.orderedDate).getTime();
      if (!isNaN(t) && t >= sevenDaysAgoMs) out.recent.push(o);
    }
  }
  out.active.sort(function (a, b) { return new Date(b.dateAdded) - new Date(a.dateAdded); });
  out.recent.sort(function (a, b) { return new Date(b.orderedDate) - new Date(a.orderedDate); });
  return { ok: true, active: out.active, recent: out.recent, categories: out.categories };
}

function addOrder(payload) {
  payload = payload || {};
  const itemName = String(payload.itemName || '').trim();
  if (!itemName) return { ok: false, error: 'Item name required' };
  const sh = ensureSheet_();
  const id = newId_();
  const dateAdded = payload.dateAdded ? new Date(payload.dateAdded) : new Date();
  if (isNaN(dateAdded.getTime())) return { ok: false, error: 'Invalid date' };
  const qty = payload.quantity === '' || payload.quantity == null
    ? '' : Number(payload.quantity);
  const notes = String(payload.notes || '').trim();
  sh.appendRow([
    id, dateAdded, itemName, sanitiseCategory_(payload.category),
    qty, notes, sanitiseInitials_(payload.addedBy),
    'Active', '', ''
  ]);
  SpreadsheetApp.flush();
  return { ok: true, orderId: id };
}

function markOrdered(orderId, initials) {
  const sh = ensureSheet_();
  const row = findRowById_(sh, orderId);
  if (row === -1) return { ok: false, error: 'Order not found' };
  sh.getRange(row, 8, 1, 3).setValues([['Ordered', new Date(), sanitiseInitials_(initials)]]);
  SpreadsheetApp.flush();
  return { ok: true };
}

function undoOrdered(orderId) {
  const sh = ensureSheet_();
  const row = findRowById_(sh, orderId);
  if (row === -1) return { ok: false, error: 'Order not found' };
  sh.getRange(row, 8, 1, 3).setValues([['Active', '', '']]);
  SpreadsheetApp.flush();
  return { ok: true };
}

function reAddOrder(orderId, addedBy) {
  const sh = ensureSheet_();
  const row = findRowById_(sh, orderId);
  if (row === -1) return { ok: false, error: 'Order not found' };
  const src = rowToObj_(sh.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
  return addOrder({
    itemName: src.itemName, category: src.category,
    quantity: src.quantity, notes: src.notes, addedBy: addedBy
  });
}

function setup() {
  ensureSheet_();
  return 'Sheet ready: ' + SHEET_NAME;
}
