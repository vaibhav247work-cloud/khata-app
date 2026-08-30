/**
 * Google Apps Script for KhataBook Pro / BuildTrack Pro
 *
 * Setup:
 * 1. Open a Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Paste this code and save.
 * 4. Deploy > New deployment > Web app.
 * 5. Set "Execute as" to "Me".
 * 6. Set "Who has access" to "Anyone".
 * 7. Copy the Web App URL and paste it into the app Admin settings.
 *
 * Notes:
 * - This script auto-creates the required sheets if missing.
 * - If a required sheet already exists, it only ensures the header row exists.
 * - It does not create duplicate sheets.
 */

const SHEET_CONFIG = {
  Transactions: [
    "id",
    "date",
    "type",
    "category",
    "amount",
    "payment_type",
    "description",
    "reference",
    "order_id",
    "synced",
  ],
  Orders: [
    "order_id",
    "items",
    "supplier",
    "total_amount",
    "paid_amount",
    "remaining_amount",
    "status",
    "date",
    "synced",
  ],
  OrderPayments: [
    "payment_id",
    "order_id",
    "amount",
    "payment_type",
    "date",
    "synced",
  ],
};

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeCellValue_(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

function ensureSheetWithHeaders_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const missingOrDifferentHeader = headers.some(function(header, index) {
    return currentHeaders[index] !== header;
  });

  if (missingOrDifferentHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function ensureRequiredSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ensuredSheets = {};

  Object.keys(SHEET_CONFIG).forEach(function(sheetName) {
    ensuredSheets[sheetName] = ensureSheetWithHeaders_(ss, sheetName, SHEET_CONFIG[sheetName]);
  });

  return {
    ss: ss,
    sheets: ensuredSheets,
  };
}

function clearSheetBody_(sheet, headers) {
  if (sheet.getLastRow() > 1) {
    sheet
      .getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), headers.length))
      .clearContent();
  }
}

function getSheetHeaders_(sheetName) {
  return SHEET_CONFIG[sheetName] || null;
}

function getSheetKey_(sheetName) {
  return {
    Transactions: "id",
    Orders: "order_id",
    OrderPayments: "payment_id",
  }[sheetName];
}

function getRowsAsObjects_(sheet, headers) {
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const rowCount = lastRow - 1;
  const values = sheet.getRange(2, 1, rowCount, headers.length).getValues();

  return values
    .filter(function(row) {
      return row.some(function(cell) {
        return cell !== "";
      });
    })
    .map(function(row) {
      const obj = {};
      headers.forEach(function(header, index) {
        obj[header] = row[index];
      });
      return obj;
    });
}

function upsertRows_(sheet, headers, data, keyHeader) {
  var keyIndex = headers.indexOf(keyHeader);
  var lastRow = sheet.getLastRow();
  var existingValues = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    : [];
  var rowsByKey = {};
  var duplicateRows = [];

  existingValues.forEach(function(row, index) {
    var key = String(row[keyIndex] || "");
    if (!key) return;
    if (rowsByKey[key]) {
      duplicateRows.push(index + 2);
    } else {
      rowsByKey[key] = index + 2;
    }
  });

  // Remove only pre-existing duplicate keys; never clear the sheet body.
  duplicateRows.sort(function(a, b) { return b - a; }).forEach(function(rowNumber) {
    sheet.deleteRow(rowNumber);
  });

  // Row numbers above change when a duplicate below them is removed.
  rowsByKey = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
      .forEach(function(row, index) {
        var key = String(row[keyIndex] || "");
        if (key && !rowsByKey[key]) rowsByKey[key] = index + 2;
      });
  }

  var payloadByKey = {};
  data.forEach(function(item) {
    var key = String(item[keyHeader] || "");
    if (key) payloadByKey[key] = item;
  });

  var inserted = 0;
  var updated = 0;
  Object.keys(payloadByKey).forEach(function(key) {
    var item = payloadByKey[key];
    var values = headers.map(function(header) {
      return normalizeCellValue_(item[header]);
    });
    if (rowsByKey[key]) {
      sheet.getRange(rowsByKey[key], 1, 1, headers.length).setValues([values]);
      updated++;
    } else {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([values]);
      rowsByKey[key] = sheet.getLastRow();
      inserted++;
    }
  });

  return { inserted: inserted, updated: updated, duplicatesRemoved: duplicateRows.length };
}

function doGet(e) {
  const request = e || {};
  const params = request.parameter || {};
  const requestedSheet = params.sheet;
  const setup = ensureRequiredSheets_();

  if (!requestedSheet) {
    return jsonResponse_({
      success: true,
      message: "Sheets are ready.",
      sheets: Object.keys(SHEET_CONFIG),
    });
  }

  const headers = getSheetHeaders_(requestedSheet);
  if (!headers) {
    return jsonResponse_({
      error: "Invalid sheet name",
      allowedSheets: Object.keys(SHEET_CONFIG),
    });
  }

  const sheet = setup.sheets[requestedSheet];
  const rows = getRowsAsObjects_(sheet, headers);

  return jsonResponse_(rows);
}

function doPost(e) {
  const setup = ensureRequiredSheets_();

  if (!e || !e.postData || !e.postData.contents) {
    return jsonResponse_({ error: "Missing request body" });
  }

  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (error) {
    return jsonResponse_({ error: "Invalid JSON body" });
  }

  const action = payload.action;
  const sheetName = payload.sheet;

  if (action === "setup") {
    return jsonResponse_({
      success: true,
      message: "Sheets and headers ensured.",
      sheets: Object.keys(SHEET_CONFIG),
    });
  }

  if (action === "resetAll") {
    Object.keys(SHEET_CONFIG).forEach(function(name) {
      clearSheetBody_(setup.sheets[name], SHEET_CONFIG[name]);
    });

    return jsonResponse_({
      success: true,
      message: "All Google Sheet data cleared. Headers were kept.",
      sheets: Object.keys(SHEET_CONFIG),
    });
  }

  if (action !== "sync") {
    return jsonResponse_({ error: "Invalid action" });
  }

  if (!sheetName) {
    return jsonResponse_({ error: "Sheet name is required" });
  }

  const headers = getSheetHeaders_(sheetName);
  if (!headers) {
    return jsonResponse_({
      error: "Invalid sheet name",
      allowedSheets: Object.keys(SHEET_CONFIG),
    });
  }

  const keyHeader = getSheetKey_(sheetName);
  if (!keyHeader) {
    return jsonResponse_({ error: "No unique key configured for sheet" });
  }

  const sheet = setup.sheets[sheetName];
  const data = Array.isArray(payload.data) ? payload.data : [];
  const result = upsertRows_(sheet, headers, data, keyHeader);

  return jsonResponse_({
    success: true,
    sheet: sheetName,
    key: keyHeader,
    rows: data.length,
    inserted: result.inserted,
    updated: result.updated,
    duplicatesRemoved: result.duplicatesRemoved,
  });
}
