/**
 * Google Apps Script for Inventory Management Backend (8-Column Version)
 * Paste this code into your Google Sheet's Extension -> Apps Script editor.
 * Deploy it as a Web App with access set to "Anyone".
 */

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var jsonArray = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      // Ensure the row has a Product Name or Catalogue Number
      if (!row[1] && !row[6]) continue; 
      
      var record = {};
      for (var j = 0; j < headers.length; j++) {
        record[headers[j].toString().trim()] = row[j];
      }
      // Add row index (1-based, including header, so row i is index i+1 in Google Sheets)
      record["row_index"] = i + 1;
      jsonArray.push(record);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", data: jsonArray }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var params = JSON.parse(e.postData.contents);
    var action = params.action;
    
    if (action === "update") {
      var rowIndex = parseInt(params.row_index);
      var quantity = params.quantity; // Save as string to preserve suffixes like " Pcs"
      
      // Update quantity (assuming Quantity is the 4th column / D)
      sheet.getRange(rowIndex, 4).setValue(quantity);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Quantity updated" }))
        .setMimeType(ContentService.MimeType.JSON);
    } 
    
    else if (action === "add") {
      var newNo = sheet.getLastRow();
      
      // Append row: No., Product Name, Packing Size, Quantity, Condition, Customers, Catalogue Number, Specs
      sheet.appendRow([
        newNo,
        params.product_name || "",
        params.packing_size || "",
        params.quantity || "0",
        params.condition || "",
        params.customers || "",
        params.catalogue_number || "",
        params.specs || ""
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Item added successfully" }))
        .setMimeType(ContentService.MimeType.JSON);
    } 
    
    else if (action === "delete") {
      var rowIndex = parseInt(params.row_index);
      sheet.deleteRow(rowIndex);
      
      // Re-index the No. column (Column A) for all remaining items
      var lastRow = sheet.getLastRow();
      for (var r = 2; r <= lastRow; r++) {
        sheet.getRange(r, 1).setValue(r - 1);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Item deleted successfully" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (action === "bulk_import") {
      var items = params.items; 
      
      // Clear all rows except the header
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
      
      // Append the new rows
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        sheet.appendRow([
          i + 1, // No.
          item["Product Name"] || "",
          item["Packing Size"] || "",
          item["Quantity"] || "0",
          item["Condition"] || "",
          item["Customers"] || "",
          item["Catalogue Number"] || "",
          item["Specs"] || ""
        ]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Bulk import complete. Imported " + items.length + " items." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid action" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
