/**
 * Google Apps Script for BuildTrack Pro
 * 
 * 1. Create a Google Sheet.
 * 2. Rename Sheet1 to "Transactions".
 * 3. Create a new sheet named "Orders".
 * 4. Create a new sheet named "OrderPayments".
 * 5. Open Extensions > Apps Script.
 * 6. Paste this code and click Deploy > New Deployment > Web App.
 * 7. Set "Execute as" to "Me" and "Who has access" to "Anyone".
 * 8. Copy the Web App URL and paste it into the Admin settings of BuildTrack Pro.
 */

function doGet(e) {
  const sheetName = e.parameter.sheet;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({error: "Sheet not found"})).setMimeType(ContentService.MimeType.JSON);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  const result = rows.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
  
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const action = payload.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (action === "sync") {
    const data = payload.data;
    
    // Process each sheet
    const sheetsToProcess = [
      { name: 'Transactions', data: data.transactions, idField: 'id' },
      { name: 'Orders', data: data.orders, idField: 'order_id' },
      { name: 'OrderPayments', data: data.payments, idField: 'payment_id' }
    ];

    sheetsToProcess.forEach(s => {
      const sheet = ss.getSheetByName(s.name);
      if (!sheet) return;

      const headers = sheet.getDataRange().getValues()[0];
      const existingData = sheet.getDataRange().getValues().slice(1);
      
      s.data.forEach(item => {
        let found = false;
        // Find existing row by ID
        for (let i = 0; i < existingData.length; i++) {
          const idIndex = headers.indexOf(s.idField);
          if (existingData[i][idIndex] == item[s.idField]) {
            // Update existing row
            const newRow = headers.map(header => item[header] !== undefined ? item[header] : existingData[i][headers.indexOf(header)]);
            sheet.getRange(i + 2, 1, 1, headers.length).setValues([newRow]);
            found = true;
            break;
          }
        }
        
        // If not found, append
        if (!found) {
          const newRow = headers.map(header => item[header] || "");
          sheet.appendRow(newRow);
        }
      });
    });
    
    return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({error: "Invalid action"})).setMimeType(ContentService.MimeType.JSON);
}
