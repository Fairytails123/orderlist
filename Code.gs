/**
 * The Fairy Tails — Staff Order List
 * Google Apps Script backend
 */

/* If you opened this script from inside a Google Sheet (Extensions → Apps
 * Script) the script is "container-bound" and SHEET_ID can stay empty —
 * SpreadsheetApp.getActive() will find the Sheet automatically.
 * If the script is standalone (created at script.google.com), paste the
 * Sheet's ID below. The ID is the long string in the Sheet URL between /d/
 * and /edit.
 */
const SHEET_ID = '1OoNBrlhogrfRobAfHhDAA1QsAwDIzEinvCu3TzEvAQE';

const SHEET_NAME = 'Staff Orders';
const HEADERS = [
  'Order ID', 'Date Added', 'Item Name', 'Category', 'Quantity',
  'Notes', 'Added By', 'Status', 'Ordered Date', 'Ordered By',
  'Attention Note', 'Attention Date', 'Attention By', 'Removed Date',
  'Removed By'
];
const ATTENTION_RETENTION_DAYS = 30;
const CATEGORIES = [
  'Dog Grooming', 'Dog Training', 'Dog Boarding',
  'Doggy Daycare', 'Miscellaneous'
];

/* ----------------------------- Web entry points --------------------------- */

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
      case 'flagAttention':
        return flagAttention(params.orderId, params.note, params.initials);
      case 'updateAttentionNote':
        return updateAttentionNote(params.orderId, params.note);
      case 'restoreOrder': return restoreOrder(params.orderId);
      case 'removeOrder':
        return removeOrder(params.orderId, params.initials);
      case 'undoRemove':   return undoRemove(params.orderId);
      default:             return { ok: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

/* ------------------------------ Sheet helpers ----------------------------- */

function getSpreadsheet_() {
  if (SHEET_ID) {
    return SpreadsheetApp.openById(SHEET_ID);
  }
  const ss = SpreadsheetApp.getActive();
  if (!ss) {
    throw new Error(
      'No spreadsheet found. Either (a) open the Apps Script editor from ' +
      'inside your Google Sheet via Extensions → Apps Script, or ' +
      '(b) paste your Sheet ID into the SHEET_ID constant at the top of ' +
      'Code.gs and redeploy.'
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
    const maxColumns = sh.getMaxColumns();
    if (maxColumns < HEADERS.length) {
      sh.insertColumnsAfter(maxColumns, HEADERS.length - maxColumns);
    }
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
    orderedBy:   row[9],
    attentionNote: row[10],
    attentionDate: row[11] instanceof Date ? row[11].toISOString() : row[11],
    attentionBy: row[12],
    removedDate: row[13] instanceof Date ? row[13].toISOString() : row[13],
    removedBy:   row[14]
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

function isAttentionLive_(value) {
  if (!value) return false;
  const flaggedMs = value instanceof Date
    ? value.getTime() : new Date(value).getTime();
  if (isNaN(flaggedMs)) return false;
  const retentionMs = ATTENTION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - flaggedMs <= retentionMs;
}

function statusAtRow_(sh, row) {
  return sh.getRange(row, 8, 1, 1).getValues()[0][0];
}

function requireStatus_(sh, row, expected) {
  if (statusAtRow_(sh, row) !== expected) {
    return { ok: false, error: 'Order is not ' + expected };
  }
  return null;
}

/* ------------------------------ Public API -------------------------------- */

function getOrders() {
  const sh = ensureSheet_();
  const last = sh.getLastRow();
  const out = {
    active: [], recent: [], attention: [], categories: CATEGORIES.slice()
  };
  if (last < 2) {
    return {
      ok: true, active: out.active, recent: out.recent,
      attention: out.attention, categories: out.categories,
      attentionRetentionDays: ATTENTION_RETENTION_DAYS
    };
  }
  const data = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (let i = 0; i < data.length; i++) {
    const o = rowToObj_(data[i]);
    if (o.status === 'Active') out.active.push(o);
    else if (o.status === 'Ordered' && o.orderedDate) {
      const t = new Date(o.orderedDate).getTime();
      if (!isNaN(t) && t >= sevenDaysAgoMs) out.recent.push(o);
    } else if (o.status === 'Needs Attention' &&
               isAttentionLive_(o.attentionDate)) {
      out.attention.push(o);
    }
  }
  out.active.sort(function (a, b) { return new Date(b.dateAdded) - new Date(a.dateAdded); });
  out.recent.sort(function (a, b) { return new Date(b.orderedDate) - new Date(a.orderedDate); });
  out.attention.sort(function (a, b) {
    return new Date(b.attentionDate) - new Date(a.attentionDate);
  });
  return {
    ok: true, active: out.active, recent: out.recent,
    attention: out.attention, categories: out.categories,
    attentionRetentionDays: ATTENTION_RETENTION_DAYS
  };
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
  const row = [
    id, dateAdded, itemName, sanitiseCategory_(payload.category),
    qty, notes, sanitiseInitials_(payload.addedBy),
    'Active'
  ].concat(new Array(HEADERS.length - 8).fill(''));
  sh.appendRow(row);
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
  const attentionDate = sh.getRange(row, 12, 1, 1).getValues()[0][0];
  const status = isAttentionLive_(attentionDate) ? 'Needs Attention' : 'Active';
  sh.getRange(row, 8, 1, 3).setValues([[status, '', '']]);
  SpreadsheetApp.flush();
  return { ok: true };
}

function flagAttention(orderId, note, initials) {
  const sh = ensureSheet_();
  const row = findRowById_(sh, orderId);
  if (row === -1) return { ok: false, error: 'Order not found' };
  const statusError = requireStatus_(sh, row, 'Active');
  if (statusError) return statusError;
  const cleanNote = String(note || '').trim();
  if (!cleanNote) return { ok: false, error: 'Attention note required' };
  const cleanInitials = sanitiseInitials_(initials);
  if (!cleanInitials) return { ok: false, error: 'Initials required' };
  sh.getRange(row, 11, 1, 3)
    .setValues([[cleanNote, new Date(), cleanInitials]]);
  sh.getRange(row, 8, 1, 1).setValue('Needs Attention');
  SpreadsheetApp.flush();
  return { ok: true };
}

function updateAttentionNote(orderId, note) {
  const sh = ensureSheet_();
  const row = findRowById_(sh, orderId);
  if (row === -1) return { ok: false, error: 'Order not found' };
  const statusError = requireStatus_(sh, row, 'Needs Attention');
  if (statusError) return statusError;
  const cleanNote = String(note || '').trim();
  if (!cleanNote) return { ok: false, error: 'Attention note required' };
  sh.getRange(row, 11, 1, 1).setValue(cleanNote);
  sh.getRange(row, 8, 1, 1).setValue('Needs Attention');
  SpreadsheetApp.flush();
  return { ok: true };
}

function restoreOrder(orderId) {
  const sh = ensureSheet_();
  const row = findRowById_(sh, orderId);
  if (row === -1) return { ok: false, error: 'Order not found' };
  const statusError = requireStatus_(sh, row, 'Needs Attention');
  if (statusError) return statusError;
  sh.getRange(row, 8, 1, 1).setValue('Active');
  sh.getRange(row, 12, 1, 2).setValues([['', '']]);
  SpreadsheetApp.flush();
  return { ok: true };
}

function removeOrder(orderId, initials) {
  const sh = ensureSheet_();
  const row = findRowById_(sh, orderId);
  if (row === -1) return { ok: false, error: 'Order not found' };
  const statusError = requireStatus_(sh, row, 'Needs Attention');
  if (statusError) return statusError;
  const cleanInitials = sanitiseInitials_(initials);
  if (!cleanInitials) return { ok: false, error: 'Initials required' };
  sh.getRange(row, 14, 1, 2).setValues([[new Date(), cleanInitials]]);
  sh.getRange(row, 8, 1, 1).setValue('Removed');
  SpreadsheetApp.flush();
  return { ok: true };
}

function undoRemove(orderId) {
  const sh = ensureSheet_();
  const row = findRowById_(sh, orderId);
  if (row === -1) return { ok: false, error: 'Order not found' };
  const statusError = requireStatus_(sh, row, 'Removed');
  if (statusError) return statusError;
  const attentionDate = sh.getRange(row, 12, 1, 1).getValues()[0][0];
  const status = isAttentionLive_(attentionDate) ? 'Needs Attention' : 'Active';
  sh.getRange(row, 14, 1, 2).setValues([['', '']]);
  sh.getRange(row, 8, 1, 1).setValue(status);
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
