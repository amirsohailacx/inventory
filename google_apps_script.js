/**
 * Google Apps Script for Inventory Management Backend (6-Column + Email Alerts)
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
      if (!row[1] && !row[4]) continue; 
      
      var record = {};
      for (var j = 0; j < headers.length; j++) {
        record[headers[j].toString().trim()] = row[j];
      }
      // Add row index (1-based, including header)
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
      
      // Update quantity (assuming Quantity is the 3rd column / C)
      sheet.getRange(rowIndex, 3).setValue(quantity);
      
      // Send low-stock alert email if quantity is below 5
      var productName = sheet.getRange(rowIndex, 2).getValue();
      var catalogueNumber = sheet.getRange(rowIndex, 5).getValue();
      checkLowStockAndEmail(productName, catalogueNumber, quantity);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Quantity updated" }))
        .setMimeType(ContentService.MimeType.JSON);
    } 
    
    else if (action === "add") {
      var newNo = sheet.getLastRow();
      
      // Append row: No., Product Name, Quantity, Condition, Catalogue Number, Specs
      sheet.appendRow([
        newNo,
        params.product_name || "",
        params.quantity || "0",
        params.condition || "",
        params.catalogue_number || "",
        params.specs || ""
      ]);
      
      // Send low-stock alert email if quantity is below 5
      checkLowStockAndEmail(params.product_name, params.catalogue_number, params.quantity);
      
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
      
      var lowStockItems = [];
      
      // Append the new rows
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        sheet.appendRow([
          i + 1, // No.
          item["Product Name"] || "",
          item["Quantity"] || "0",
          item["Condition"] || "",
          item["Catalogue Number"] || "",
          item["Specs"] || ""
        ]);
        
        // Track low-stock items in the bulk list
        var qtyVal = parseInt(item["Quantity"]) || 0;
        if (qtyVal < 5) {
          lowStockItems.push("- " + item["Product Name"] + " (Qty: " + item["Quantity"] + ")");
        }
      }
      
      // Send low-stock digest email for bulk imports if any exist
      if (lowStockItems.length > 0) {
        sendBulkLowStockEmail(lowStockItems);
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

/**
 * Sends a low stock alert email for a single item.
 */
function checkLowStockAndEmail(productName, catalogueNumber, qtyString) {
  try {
    var qty = parseInt(qtyString);
    if (!isNaN(qty) && qty < 5) {
      var recipient = Session.getActiveUser().getEmail() || SpreadsheetApp.getActiveSpreadsheet().getOwner().getEmail();
      if (recipient) {
        var subject = "⚠️ ACX Instruments Stock Alert: " + productName + " is Low";
        var body = "Dear Administrator,\n\n" +
                   "An item in your ACX Instruments inventory has dropped below the low-stock threshold (5 items):\n\n" +
                   "• Product Name: " + productName + "\n" +
                   "• Catalogue Number: " + (catalogueNumber || "N/A") + "\n" +
                   "• Current Stock: " + qtyString + "\n\n" +
                   "Please log in to your dashboard to review or reorder stock.\n\n" +
                   "Best regards,\n" +
                   "ACX Instruments Inventory System";
        MailApp.sendEmail(recipient, subject, body);
      }
    }
  } catch (err) {
    Logger.log("Failed to send low stock email: " + err.toString());
  }
}

/**
 * Sends a summary low stock alert email for bulk imports.
 */
function sendBulkLowStockEmail(lowStockLines) {
  try {
    var recipient = Session.getActiveUser().getEmail() || SpreadsheetApp.getActiveSpreadsheet().getOwner().getEmail();
    if (recipient) {
      var subject = "⚠️ ACX Instruments Bulk Stock Alert: Multiple Low Stock Items";
      var body = "Dear Administrator,\n\n" +
                 "Following a bulk data import, the following items in your inventory are below the threshold of 5:\n\n" +
                 lowStockLines.join("\n") + "\n\n" +
                 "Please log in to your dashboard to review or reorder stock.\n\n" +
                 "Best regards,\n" +
                 "ACX Instruments Inventory System";
      MailApp.sendEmail(recipient, subject, body);
    }
  } catch (err) {
    Logger.log("Failed to send bulk low stock email: " + err.toString());
  }
}
