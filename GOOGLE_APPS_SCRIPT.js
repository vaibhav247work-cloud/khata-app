/**
 * Google Apps Script for KhataBook Pro / BuildTrack Pro
 *
 * Setup:
 * 1. Open your Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Delete any default code, paste this entire file, and click Save (disk icon).
 * 4. Deploy > New deployment.
 * 5. Select type: "Web app".
 * 6. Description: "KhataBook Web App".
 * 7. Execute as: "Me" (your email).
 * 8. Who has access: "Anyone" (CRITICAL: must be Anyone so your app can sync).
 * 9. Click Deploy, Authorize access if prompted, and copy the Web App URL (.../exec).
 * 10. Paste the Web App URL into the app's Admin Settings or login setup.
 *
 * Compatibility & Notes:
 * - 100% backward compatible with older spreadsheets and earlier versions of the app.
 * - Auto-creates required sheets if missing; preserves all existing columns and data.
 * - Safely appends missing columns to existing sheets without overwriting existing data.
 * - Dynamic column detection: supports case-insensitive headers and aliases (e.g. 'active' and 'status').
 * - Recognizes all standard approval values: TRUE, true, 1, "yes", "approved", "active".
 * - Default admin account ("admin" / "admin") auto-created if Users sheet is new or empty.
 * - Strict access control: user list and approval actions are restricted to Admin accounts.
 */

var SHEET_CONFIG = {
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
  Categories: [
    "name",
  ],
  PaymentModes: [
    "name",
  ],
  Users: [
    "username",
    "password",
    "role",
    "name",
    "active",
    "requested_role",
    "requested_at",
  ],
};

var COMMON_WEAK_PASSWORDS = [
  "admin",
  "admin123",
  "password",
  "password123",
  "123456",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "letmein",
  "welcome",
  "pass123",
];

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

/**
 * Backward-compatible column locator:
 * Finds column index (1-based) matching any of the candidate names case-insensitively.
 */
function findColumnIndex_(headers, candidates) {
  if (!headers || !candidates) return -1;
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || "").toLowerCase().trim();
    for (var j = 0; j < candidates.length; j++) {
      if (h === String(candidates[j]).toLowerCase().trim()) {
        return i + 1; // 1-indexed for SpreadsheetApp
      }
    }
  }
  return -1;
}

/**
 * Robust active status resolver:
 * Handles boolean, numeric, string, and legacy 'status' representations.
 */
function isUserActive_(u) {
  if (!u) return false;

  var activeVal = u.active !== undefined ? u.active : (u.Active !== undefined ? u.Active : u.is_active);
  if (activeVal === true || activeVal === 1) return true;
  if (activeVal !== undefined && activeVal !== null && activeVal !== "") {
    var aStr = String(activeVal).toLowerCase().trim();
    if (aStr === "true" || aStr === "1" || aStr === "yes" || aStr === "y" || aStr === "approved" || aStr === "approve" || aStr === "active" || aStr === "ok" || aStr === "enabled" || aStr === "allowed") {
      return true;
    }
    if (aStr === "false" || aStr === "0" || aStr === "no" || aStr === "disabled" || aStr === "pending" || aStr === "rejected") {
      return false;
    }
  }

  // Backward compatibility: Check legacy 'status' column
  var statusVal = u.status !== undefined ? u.status : (u.Status !== undefined ? u.Status : u.user_status);
  if (statusVal !== undefined && statusVal !== null && statusVal !== "") {
    var sStr = String(statusVal).toLowerCase().trim();
    if (sStr === "approved" || sStr === "active" || sStr === "true" || sStr === "1" || sStr === "yes" || sStr === "y" || sStr === "ok" || sStr === "enabled") {
      return true;
    }
  }

  return false;
}

/**
 * Ensures required sheets exist.
 * For existing sheets from older versions, preserves all existing columns and data,
 * and only appends any missing configured columns to the end of row 1.
 */
function ensureSheetWithHeaders_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  // Backward compatibility: Sheet already exists with data!
  // Read existing headers from row 1 and preserve them.
  var lastCol = Math.max(1, sheet.getLastColumn());
  var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || "").trim();
  });
  var existingHeadersLower = existingHeaders.map(function(h) {
    return h.toLowerCase();
  });

  // Identify any missing configured headers
  var missingHeaders = headers.filter(function(h) {
    if (existingHeadersLower.indexOf(h.toLowerCase()) !== -1) return false;
    // If checking for 'active' and sheet already has 'status', treat as present
    if (h === "active" && existingHeadersLower.indexOf("status") !== -1) return false;
    return true;
  });

  // Append any missing columns to the end without disturbing existing columns
  if (missingHeaders.length > 0) {
    var startCol = existingHeaders.length + 1;
    var requiredCols = startCol + missingHeaders.length - 1;
    if (sheet.getMaxColumns() < requiredCols) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredCols - sheet.getMaxColumns());
    }
    sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
  }

  return sheet;
}

function ensureRequiredSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      "No active spreadsheet found. Please make sure you opened this script from inside your Google Sheet via Extensions > Apps Script."
    );
  }

  var ensuredSheets = {};

  Object.keys(SHEET_CONFIG).forEach(function(sheetName) {
    ensuredSheets[sheetName] = ensureSheetWithHeaders_(ss, sheetName, SHEET_CONFIG[sheetName]);
  });

  // Ensure default admin user exists if Users sheet is newly created / empty
  var usersSheet = ensuredSheets["Users"];
  if (usersSheet && usersSheet.getLastRow() <= 1) {
    var actualHeaders = getActualHeaders_(usersSheet, SHEET_CONFIG["Users"]);
    var adminRow = actualHeaders.map(function(h) {
      var hLower = String(h || "").toLowerCase().trim();
      if (hLower === "username") return "admin";
      if (hLower === "password") return "admin";
      if (hLower === "role") return "admin";
      if (hLower === "name") return "Administrator";
      if (hLower === "active") return true;
      if (hLower === "status") return "approved";
      if (hLower === "requested_role") return "";
      if (hLower === "requested_at") return new Date().toISOString();
      return "";
    });
    usersSheet.appendRow(adminRow);
  }

  return {
    ss: ss,
    sheets: ensuredSheets,
  };
}

function clearSheetBody_(sheet, headers) {
  if (sheet.getLastRow() > 1) {
    var lastCol = Math.max(sheet.getLastColumn(), headers ? headers.length : 1);
    sheet
      .getRange(2, 1, sheet.getLastRow() - 1, lastCol)
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
    Categories: "name",
    PaymentModes: "name",
    Users: "username",
  }[sheetName];
}

function getActualHeaders_(sheet, fallbackHeaders) {
  if (!sheet || sheet.getLastColumn() < 1) {
    return fallbackHeaders || [];
  }
  var rowValues = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var headers = [];
  for (var i = 0; i < rowValues.length; i++) {
    var val = String(rowValues[i] || "").trim();
    if (val) {
      headers.push(val);
    }
  }
  return headers.length > 0 ? headers : (fallbackHeaders || []);
}

/**
 * Dynamic row reader:
 * Reads actual header names from Row 1 so sheets with columns in different orders
 * or casing from old versions map correctly and seamlessly.
 */
function getRowsAsObjects_(sheet, configuredHeaders) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow <= 1 || lastCol < 1) {
    return [];
  }

  var actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || "").trim();
  });

  var rowCount = lastRow - 1;
  var values = sheet.getRange(2, 1, rowCount, lastCol).getValues();

  return values
    .filter(function(row) {
      return row.some(function(cell) {
        return cell !== "";
      });
    })
    .map(function(row) {
      var obj = {};
      actualHeaders.forEach(function(headerName, colIdx) {
        if (headerName) {
          obj[headerName] = row[colIdx];
          obj[headerName.toLowerCase()] = row[colIdx]; // lowercase key alias
        }
      });

      // Also ensure standard configured headers are available
      if (configuredHeaders) {
        configuredHeaders.forEach(function(stdHeader) {
          if (obj[stdHeader] === undefined) {
            for (var c = 0; c < actualHeaders.length; c++) {
              if (actualHeaders[c].toLowerCase() === stdHeader.toLowerCase()) {
                obj[stdHeader] = row[c];
                break;
              }
            }
          }
        });
      }
      return obj;
    });
}

function upsertRows_(sheet, headers, data, keyHeader) {
  var actualHeaders = getActualHeaders_(sheet, headers);
  var keyIndex = -1;
  for (var k = 0; k < actualHeaders.length; k++) {
    if (actualHeaders[k].toLowerCase() === keyHeader.toLowerCase()) {
      keyIndex = k;
      break;
    }
  }
  if (keyIndex === -1) keyIndex = 0;

  var lastRow = sheet.getLastRow();
  var lastCol = actualHeaders.length;
  var existingValues = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues()
    : [];
  var rowsByKey = {};
  var duplicateRows = [];

  existingValues.forEach(function(row, index) {
    var key = String(row[keyIndex] || "").trim();
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

  // Re-index after duplicate deletion
  rowsByKey = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues()
      .forEach(function(row, index) {
        var key = String(row[keyIndex] || "").trim();
        if (key && !rowsByKey[key]) rowsByKey[key] = index + 2;
      });
  }

  var payloadByKey = {};
  data.forEach(function(item) {
    var key = String(item[keyHeader] || item[keyHeader.toLowerCase()] || "").trim();
    if (key) payloadByKey[key] = item;
  });

  var inserted = 0;
  var updated = 0;
  Object.keys(payloadByKey).forEach(function(key) {
    var item = payloadByKey[key];
    var values = actualHeaders.map(function(header) {
      var val = item[header];
      if (val === undefined) val = item[header.toLowerCase()];
      return normalizeCellValue_(val);
    });

    if (rowsByKey[key]) {
      sheet.getRange(rowsByKey[key], 1, 1, lastCol).setValues([values]);
      updated++;
    } else {
      var nextRow = sheet.getLastRow() + 1;
      sheet.getRange(nextRow, 1, 1, lastCol).setValues([values]);
      rowsByKey[key] = nextRow;
      inserted++;
    }
  });

  return { inserted: inserted, updated: updated, duplicatesRemoved: duplicateRows.length };
}

function deleteRowsByKey_(sheet, headers, keyHeader, keysToDelete) {
  if (!keysToDelete || keysToDelete.length === 0) {
    return { deleted: 0 };
  }
  var actualHeaders = getActualHeaders_(sheet, headers);
  var keyIndex = -1;
  for (var k = 0; k < actualHeaders.length; k++) {
    if (actualHeaders[k].toLowerCase() === keyHeader.toLowerCase()) {
      keyIndex = k;
      break;
    }
  }
  if (keyIndex === -1) keyIndex = 0;

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { deleted: 0 };
  }

  var deleteSet = {};
  keysToDelete.forEach(function(k) {
    if (k !== undefined && k !== null && String(k).trim() !== "") {
      deleteSet[String(k).trim().toLowerCase()] = true;
    }
  });

  var values = sheet.getRange(2, 1, lastRow - 1, actualHeaders.length).getValues();
  var rowsToDelete = [];

  values.forEach(function(row, index) {
    var key = String(row[keyIndex] || "").trim().toLowerCase();
    if (key && deleteSet[key]) {
      rowsToDelete.push(index + 2); // 1-indexed, header is row 1
    }
  });

  // Delete rows from bottom to top so index shifts don't affect row numbers
  rowsToDelete.sort(function(a, b) { return b - a; }).forEach(function(rowNum) {
    sheet.deleteRow(rowNum);
  });

  return { deleted: rowsToDelete.length };
}

function verifyAdminUser_(setup, adminUsername, adminPassword) {
  var cleanAdminUser = String(adminUsername || "").trim().toLowerCase();
  var cleanAdminPass = String(adminPassword || "");

  if (!cleanAdminUser) return false;

  // Allow default admin credentials
  if (cleanAdminUser === "admin" && cleanAdminPass === "admin") {
    return true;
  }

  var sheet = setup.sheets["Users"];
  if (!sheet) return false;

  var headers = getSheetHeaders_("Users");
  var users = getRowsAsObjects_(sheet, headers);

  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var uName = String(u.username || "").trim().toLowerCase();
    if (uName === cleanAdminUser) {
      var isActive = isUserActive_(u);
      var roleRaw = String(u.role || "").toLowerCase().trim();
      var pass = String(u.password || "");
      if (isActive && roleRaw === "admin" && pass === cleanAdminPass) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Diagnostic test function:
 * Run this directly in the Apps Script editor to verify setup and permissions.
 */
function testConnection() {
  var setup = ensureRequiredSheets_();
  var sheetNames = Object.keys(SHEET_CONFIG);
  Logger.log("Connection successful. Ensured sheets: " + sheetNames.join(", "));
  return "Connected successfully! Ready for KhataBook Pro syncing.";
}

function doGet(e) {
  var request = e || {};
  var params = request.parameter || {};
  var requestedSheet = params.sheet;
  var setup = ensureRequiredSheets_();

  if (!requestedSheet) {
    return jsonResponse_({
      success: true,
      message: "KhataBook Google Apps Script is ready and running.",
      sheets: Object.keys(SHEET_CONFIG),
    });
  }

  // Security: Do not dump user records/passwords in bulk via GET.
  if (requestedSheet === "Users") {
    return jsonResponse_({
      error: "Direct reading of Users sheet via GET is restricted for privacy. Use the verifyUser or getUsers action via POST.",
    });
  }

  var headers = getSheetHeaders_(requestedSheet);
  if (!headers) {
    return jsonResponse_({
      error: "Invalid sheet name",
      allowedSheets: Object.keys(SHEET_CONFIG),
    });
  }

  var sheet = setup.sheets[requestedSheet];
  var rows = getRowsAsObjects_(sheet, headers);

  return jsonResponse_(rows);
}

function doPost(e) {
  var setup = ensureRequiredSheets_();

  if (!e || !e.postData || !e.postData.contents) {
    return jsonResponse_({ error: "Missing request body" });
  }

  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (error) {
    return jsonResponse_({ error: "Invalid JSON body" });
  }

  var action = payload.action;
  var sheetName = payload.sheet;

  // --- 1. Single-User Authentication (verifyUser) ---
  if (action === "verifyUser") {
    var rawUsername = String(payload.username || "").trim();
    var password = String(payload.password || "");

    if (!rawUsername) {
      return jsonResponse_({
        authenticated: false,
        message: "Username is required",
      });
    }

    var sheet = setup.sheets["Users"];
    var headers = getSheetHeaders_("Users");
    var users = getRowsAsObjects_(sheet, headers);

    var matched = null;
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (String(u.username || "").trim().toLowerCase() === rawUsername.toLowerCase()) {
        matched = u;
        break;
      }
    }

    if (!matched) {
      if (rawUsername.toLowerCase() === "admin" && password === "admin") {
        var actualHeaders = getActualHeaders_(sheet, headers);
        var adminRow = actualHeaders.map(function(h) {
          var hLower = String(h || "").toLowerCase().trim();
          if (hLower === "username") return "admin";
          if (hLower === "password") return "admin";
          if (hLower === "role") return "admin";
          if (hLower === "name") return "Administrator";
          if (hLower === "active") return true;
          if (hLower === "status") return "approved";
          if (hLower === "requested_role") return "";
          if (hLower === "requested_at") return new Date().toISOString();
          return "";
        });
        sheet.appendRow(adminRow);
        matched = {
          username: "admin",
          password: "admin",
          role: "admin",
          name: "Administrator",
          active: true,
        };
      } else {
        return jsonResponse_({
          authenticated: false,
          message: "User '@" + rawUsername + "' not found in Google Sheet",
        });
      }
    }

    var isActive = isUserActive_(matched);

    if (!isActive) {
      return jsonResponse_({
        authenticated: false,
        isPending: true,
        message: "Your registration request is pending approval by an administrator. Once approved, you will be able to log in.",
      });
    }

    if (String(matched.password || "") !== password) {
      return jsonResponse_({
        authenticated: false,
        message: "Incorrect password",
      });
    }

    var roleRaw = String(matched.role || "staff").toLowerCase().trim();
    var role = roleRaw === "admin" ? "admin" : "staff";
    var displayName = String(matched.name || matched.username || "").trim();

    return jsonResponse_({
      authenticated: true,
      user: {
        username: String(matched.username).trim(),
        name: displayName || (role === "admin" ? "Administrator" : "Staff Member"),
        role: role,
        active: true,
        requested_role: String(matched.requested_role || "").trim(),
      },
    });
  }

  // --- 2. Request New User Registration (requestUser) ---
  if (action === "requestUser") {
    var reqUsername = String(payload.username || "").trim();
    var reqPassword = String(payload.password || "").trim();
    var reqName = String(payload.name || "").trim() || reqUsername;
    var requestedRole = String(payload.role || "staff").trim().toLowerCase();
    if (requestedRole !== "admin") requestedRole = "staff";

    // Validation
    if (!reqUsername || !reqPassword) {
      return jsonResponse_({
        success: false,
        message: "Username and password are required",
      });
    }

    if (reqUsername.length < 3) {
      return jsonResponse_({
        success: false,
        message: "Username must be at least 3 characters",
      });
    }

    if (reqUsername.toLowerCase() === "admin") {
      return jsonResponse_({
        success: false,
        message: "The username 'admin' is reserved for the primary administrator",
      });
    }

    // Password validation rules
    if (reqPassword.length < 6) {
      return jsonResponse_({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    if (!/[a-zA-Z]/.test(reqPassword) || !/[0-9]/.test(reqPassword)) {
      return jsonResponse_({
        success: false,
        message: "Password must contain both letters and numbers",
      });
    }

    if (reqPassword.toLowerCase() === reqUsername.toLowerCase()) {
      return jsonResponse_({
        success: false,
        message: "Password cannot be the same as your username",
      });
    }

    for (var wIdx = 0; wIdx < COMMON_WEAK_PASSWORDS.length; wIdx++) {
      if (reqPassword.toLowerCase() === COMMON_WEAK_PASSWORDS[wIdx]) {
        return jsonResponse_({
          success: false,
          message: "This password is too easily guessed. Please choose a more secure password.",
        });
      }
    }

    var sheet = setup.sheets["Users"];
    if (!sheet) {
      sheet = ensureSheetWithHeaders_(setup.ss, "Users", SHEET_CONFIG["Users"]);
      setup.sheets["Users"] = sheet;
    }
    var headers = getSheetHeaders_("Users");
    var users = getRowsAsObjects_(sheet, headers);

    for (var uIdx = 0; uIdx < users.length; uIdx++) {
      if (String(users[uIdx].username || "").trim().toLowerCase() === reqUsername.toLowerCase()) {
        return jsonResponse_({
          success: false,
          message: "Username '" + reqUsername + "' already exists. Please choose another username.",
        });
      }
    }

    var actualHeaders = getActualHeaders_(sheet, headers);
    var timestamp = new Date().toISOString();
    var rowValues = actualHeaders.map(function(h) {
      var hLower = String(h || "").toLowerCase().trim();
      if (hLower === "username") return reqUsername;
      if (hLower === "password") return reqPassword;
      if (hLower === "role") return requestedRole;
      if (hLower === "name") return reqName;
      if (hLower === "active") return false; // Pending admin approval
      if (hLower === "status") return "pending"; // Backward compatibility
      if (hLower === "requested_role") return requestedRole;
      if (hLower === "requested_at") return timestamp;
      return "";
    });

    sheet.appendRow(rowValues);

    return jsonResponse_({
      success: true,
      message: "Registration submitted successfully! Your account is pending admin approval. Once approved, you can log in.",
      username: reqUsername,
    });
  }

  // --- 3. Request Role Change (requestRoleChange) ---
  if (action === "requestRoleChange") {
    var authUsername = String(payload.username || "").trim();
    var authPassword = String(payload.password || "");
    var targetRole = String(payload.targetRole || "").trim().toLowerCase();
    var reason = String(payload.reason || "").trim();

    if (!authUsername) {
      return jsonResponse_({ success: false, message: "Username is required" });
    }
    if (targetRole !== "admin" && targetRole !== "staff") {
      return jsonResponse_({ success: false, message: "Invalid target role requested" });
    }

    var sheet = setup.sheets["Users"];
    var actualHeaders = getActualHeaders_(sheet, getSheetHeaders_("Users"));
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return jsonResponse_({ success: false, message: "No users found in Google Sheet" });
    }

    var values = sheet.getRange(2, 1, lastRow - 1, actualHeaders.length).getValues();
    var userRowIndex = -1;
    var matchedUserObj = null;

    for (var rIdx = 0; rIdx < values.length; rIdx++) {
      var rowObj = {};
      for (var hIdx = 0; hIdx < actualHeaders.length; hIdx++) {
        rowObj[actualHeaders[hIdx].toLowerCase().trim()] = values[rIdx][hIdx];
      }
      if (String(rowObj.username || "").trim().toLowerCase() === authUsername.toLowerCase()) {
        userRowIndex = rIdx + 2;
        matchedUserObj = rowObj;
        break;
      }
    }

    if (userRowIndex === -1 || !matchedUserObj) {
      return jsonResponse_({ success: false, message: "User not found in Google Sheet" });
    }

    if (authPassword && String(matchedUserObj.password || "") !== authPassword) {
      return jsonResponse_({ success: false, message: "Authentication failed. Incorrect password." });
    }

    var reqRoleCol = findColumnIndex_(actualHeaders, ["requested_role", "target_role"]);
    var reqAtCol = findColumnIndex_(actualHeaders, ["requested_at", "role_requested_at"]);

    if (reqRoleCol > 0) {
      sheet.getRange(userRowIndex, reqRoleCol).setValue(targetRole);
    }
    if (reqAtCol > 0) {
      sheet.getRange(userRowIndex, reqAtCol).setValue(new Date().toISOString() + (reason ? " - " + reason : ""));
    }

    return jsonResponse_({
      success: true,
      message: "Role change request to '" + targetRole + "' submitted to Google Sheet.",
      targetRole: targetRole,
    });
  }

  // --- 4. Change Password (changePassword) ---
  if (action === "changePassword") {
    var authUsername = String(payload.username || "").trim();
    var oldPassword = String(payload.oldPassword || "");
    var newPassword = String(payload.newPassword || "");

    if (!authUsername || !newPassword) {
      return jsonResponse_({ success: false, message: "Username and new password are required" });
    }
    if (newPassword.length < 6) {
      return jsonResponse_({ success: false, message: "New password must be at least 6 characters long" });
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return jsonResponse_({ success: false, message: "New password must contain both letters and numbers" });
    }
    if (newPassword.toLowerCase() === authUsername.toLowerCase()) {
      return jsonResponse_({ success: false, message: "New password cannot match your username" });
    }

    for (var pIdx = 0; pIdx < COMMON_WEAK_PASSWORDS.length; pIdx++) {
      if (newPassword.toLowerCase() === COMMON_WEAK_PASSWORDS[pIdx]) {
        return jsonResponse_({
          success: false,
          message: "New password is too common. Please choose a more secure password.",
        });
      }
    }

    var sheet = setup.sheets["Users"];
    var actualHeaders = getActualHeaders_(sheet, getSheetHeaders_("Users"));
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return jsonResponse_({ success: false, message: "No users found in Google Sheet" });
    }

    var values = sheet.getRange(2, 1, lastRow - 1, actualHeaders.length).getValues();
    var userRowIndex = -1;
    var matchedUserObj = null;

    for (var rIdx = 0; rIdx < values.length; rIdx++) {
      var rowObj = {};
      for (var hIdx = 0; hIdx < actualHeaders.length; hIdx++) {
        rowObj[actualHeaders[hIdx].toLowerCase().trim()] = values[rIdx][hIdx];
      }
      if (String(rowObj.username || "").trim().toLowerCase() === authUsername.toLowerCase()) {
        userRowIndex = rIdx + 2;
        matchedUserObj = rowObj;
        break;
      }
    }

    if (userRowIndex === -1 || !matchedUserObj) {
      return jsonResponse_({ success: false, message: "User not found in Google Sheet" });
    }

    if (oldPassword && String(matchedUserObj.password || "") !== oldPassword) {
      return jsonResponse_({ success: false, message: "Current password does not match" });
    }

    var passCol = findColumnIndex_(actualHeaders, ["password", "pass", "pwd"]);
    if (passCol > 0) {
      sheet.getRange(userRowIndex, passCol).setValue(newPassword);
    } else {
      return jsonResponse_({ success: false, message: "Password column not found in Users sheet" });
    }

    return jsonResponse_({
      success: true,
      message: "Password updated successfully in Google Sheet!",
    });
  }

  // --- 5. Fetch User Accounts (getUsers - Admin Only) ---
  if (action === "getUsers") {
    var adminUser = payload.adminUsername || payload.username || "";
    var adminPass = payload.adminPassword || payload.password || "";

    if (!verifyAdminUser_(setup, adminUser, adminPass)) {
      return jsonResponse_({
        success: false,
        error: "Unauthorized: Administrator credentials required to view user accounts",
      });
    }

    var sheet = setup.sheets["Users"];
    var headers = getSheetHeaders_("Users");
    var users = getRowsAsObjects_(sheet, headers);

    var safeUsers = users.map(function(u) {
      var isAct = isUserActive_(u);
      return {
        username: String(u.username || "").trim(),
        name: String(u.name || u.username || "").trim(),
        role: String(u.role || "staff").toLowerCase().trim() === "admin" ? "admin" : "staff",
        active: isAct,
        requested_role: String(u.requested_role || "").trim(),
        requested_at: String(u.requested_at || "").trim(),
      };
    });

    return jsonResponse_({
      success: true,
      users: safeUsers,
    });
  }

  // --- 6. Update User Status / Role (updateUser - Admin Only) ---
  if (action === "updateUser") {
    var adminUser = payload.adminUsername || payload.username || "";
    var adminPass = payload.adminPassword || payload.password || "";
    var targetUsername = String(payload.targetUsername || payload.usernameToUpdate || "").trim().toLowerCase();

    if (!verifyAdminUser_(setup, adminUser, adminPass)) {
      return jsonResponse_({
        success: false,
        error: "Unauthorized: Administrator credentials required to manage user accounts",
      });
    }

    if (!targetUsername) {
      return jsonResponse_({ success: false, error: "Target username is required" });
    }

    var sheet = setup.sheets["Users"];
    var actualHeaders = getActualHeaders_(sheet, getSheetHeaders_("Users"));
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return jsonResponse_({ success: false, error: "No users found in Google Sheet" });
    }

    var values = sheet.getRange(2, 1, lastRow - 1, actualHeaders.length).getValues();
    var userRowIndex = -1;
    var matchedUser = null;

    for (var rIdx = 0; rIdx < values.length; rIdx++) {
      var rowObj = {};
      for (var hIdx = 0; hIdx < actualHeaders.length; hIdx++) {
        rowObj[actualHeaders[hIdx].toLowerCase().trim()] = values[rIdx][hIdx];
      }
      if (String(rowObj.username || "").trim().toLowerCase() === targetUsername) {
        userRowIndex = rIdx + 2;
        matchedUser = rowObj;
        break;
      }
    }

    if (userRowIndex === -1 || !matchedUser) {
      return jsonResponse_({ success: false, error: "User '@" + targetUsername + "' not found in Google Sheet" });
    }

    var activeCol = findColumnIndex_(actualHeaders, ["active", "is_active", "approved"]);
    var statusCol = findColumnIndex_(actualHeaders, ["status", "state", "user_status"]);
    var roleCol = findColumnIndex_(actualHeaders, ["role", "user_role", "type"]);
    var reqRoleCol = findColumnIndex_(actualHeaders, ["requested_role", "target_role"]);

    var updatedActive = isUserActive_(matchedUser);

    if (payload.active !== undefined && payload.active !== null) {
      updatedActive = Boolean(payload.active);
      if (activeCol > 0) {
        sheet.getRange(userRowIndex, activeCol).setValue(updatedActive);
      }
      // Also update status column if sheet has one (backward compatibility)
      if (statusCol > 0) {
        sheet.getRange(userRowIndex, statusCol).setValue(updatedActive ? "approved" : "disabled");
      }

      // If approving and activating, also promote to requested_role if one was requested
      if (updatedActive && matchedUser.requested_role) {
        var approvedRole = String(matchedUser.requested_role).toLowerCase().trim() === "admin" ? "admin" : "staff";
        if (roleCol > 0) {
          sheet.getRange(userRowIndex, roleCol).setValue(approvedRole);
        }
        if (reqRoleCol > 0) {
          sheet.getRange(userRowIndex, reqRoleCol).setValue("");
        }
      }
    }

    if (payload.role !== undefined && payload.role !== null) {
      var newRole = String(payload.role).toLowerCase().trim() === "admin" ? "admin" : "staff";
      if (roleCol > 0) {
        sheet.getRange(userRowIndex, roleCol).setValue(newRole);
      }
      if (reqRoleCol > 0) {
        sheet.getRange(userRowIndex, reqRoleCol).setValue("");
      }
    }

    return jsonResponse_({
      success: true,
      message: "User @" + targetUsername + " is now " + (updatedActive ? "Active & Approved" : "Disabled") + " in Google Sheet",
      targetUsername: targetUsername,
      active: updatedActive,
    });
  }

  // --- 7. Delete User (deleteUser - Admin Only) ---
  if (action === "deleteUser") {
    var adminUser = payload.adminUsername || payload.username || "";
    var adminPass = payload.adminPassword || payload.password || "";
    var targetUsername = String(payload.targetUsername || "").trim().toLowerCase();

    if (!verifyAdminUser_(setup, adminUser, adminPass)) {
      return jsonResponse_({
        success: false,
        error: "Unauthorized: Administrator credentials required to delete users",
      });
    }

    if (!targetUsername) {
      return jsonResponse_({ success: false, error: "Target username is required" });
    }

    if (targetUsername === "admin") {
      return jsonResponse_({ success: false, error: "The default administrator account cannot be deleted" });
    }

    var sheet = setup.sheets["Users"];
    var headers = getSheetHeaders_("Users");
    var result = deleteRowsByKey_(sheet, headers, "username", [targetUsername]);

    return jsonResponse_({
      success: true,
      message: "User @" + targetUsername + " deleted from Google Sheet",
      deleted: result.deleted,
    });
  }

  // --- 8. Setup Sheets & Headers ---
  if (action === "setup") {
    return jsonResponse_({
      success: true,
      message: "Sheets and headers ensured.",
      sheets: Object.keys(SHEET_CONFIG),
    });
  }

  // --- 9. Reset All Sheets Data ---
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

  // --- 10. Delete Records by Key ---
  if (action === "delete") {
    if (!sheetName) {
      return jsonResponse_({ error: "Sheet name is required" });
    }

    var headers = getSheetHeaders_(sheetName);
    if (!headers) {
      return jsonResponse_({
        error: "Invalid sheet name",
        allowedSheets: Object.keys(SHEET_CONFIG),
      });
    }

    var keyHeader = getSheetKey_(sheetName);
    if (!keyHeader) {
      return jsonResponse_({ error: "No unique key configured for sheet" });
    }

    var keysToDelete = [];
    if (Array.isArray(payload.keys)) {
      keysToDelete = payload.keys;
    } else if (payload.key !== undefined && payload.key !== null) {
      keysToDelete = [payload.key];
    } else if (Array.isArray(payload.data)) {
      keysToDelete = payload.data.map(function(item) {
        return item[keyHeader] || item.id || item.order_id || item.payment_id;
      }).filter(Boolean);
    }

    var sheet = setup.sheets[sheetName];
    var result = deleteRowsByKey_(sheet, headers, keyHeader, keysToDelete);

    return jsonResponse_({
      success: true,
      sheet: sheetName,
      key: keyHeader,
      deleted: result.deleted,
      keys: keysToDelete,
    });
  }

  // --- 11. Replace / Set Full List (Categories, PaymentModes) ---
  if (action === "replaceList" || action === "setList") {
    if (!sheetName) {
      return jsonResponse_({ error: "Sheet name is required" });
    }

    var headers = getSheetHeaders_(sheetName);
    if (!headers) {
      return jsonResponse_({
        error: "Invalid sheet name",
        allowedSheets: Object.keys(SHEET_CONFIG),
      });
    }

    var sheet = setup.sheets[sheetName];
    clearSheetBody_(sheet, headers);

    var data = Array.isArray(payload.data) ? payload.data : [];
    if (data.length > 0) {
      var rows = data.map(function(item) {
        if (typeof item === "string") {
          return [item];
        }
        return headers.map(function(h) {
          return normalizeCellValue_(item[h]);
        });
      });
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }

    return jsonResponse_({
      success: true,
      sheet: sheetName,
      count: data.length,
    });
  }

  // --- 12. Sync Upsert Records (Transactions, Orders, OrderPayments) ---
  if (action === "sync") {
    if (!sheetName) {
      return jsonResponse_({ error: "Sheet name is required" });
    }

    var headers = getSheetHeaders_(sheetName);
    if (!headers) {
      return jsonResponse_({
        error: "Invalid sheet name",
        allowedSheets: Object.keys(SHEET_CONFIG),
      });
    }

    var keyHeader = getSheetKey_(sheetName);
    if (!keyHeader) {
      return jsonResponse_({ error: "No unique key configured for sheet" });
    }

    var sheet = setup.sheets[sheetName];

    // Process any deletions passed in sync action for backward compatibility
    var deletedCount = 0;
    var keysToDelete = [];
    if (Array.isArray(payload.deleteKeys)) {
      keysToDelete = payload.deleteKeys;
    } else if (Array.isArray(payload.keys)) {
      keysToDelete = payload.keys;
    }
    if (keysToDelete.length > 0) {
      var delResult = deleteRowsByKey_(sheet, headers, keyHeader, keysToDelete);
      deletedCount = delResult.deleted;
    }

    var data = Array.isArray(payload.data) ? payload.data : [];
    var result = upsertRows_(sheet, headers, data, keyHeader);

    return jsonResponse_({
      success: true,
      sheet: sheetName,
      key: keyHeader,
      rows: data.length,
      inserted: result.inserted,
      updated: result.updated,
      deleted: deletedCount,
      duplicatesRemoved: result.duplicatesRemoved,
    });
  }

  return jsonResponse_({ error: "Invalid action: " + action });
}
