/**
 * Google Apps Script for ACX Instruments Inventory Backend (Multi-Sheet Version + Base64 Image Uploads)
 * Paste this code into your Google Sheet's Extension -> Apps Script editor.
 * Deploy it as a Web App with access set to "Anyone".
 */

function doGet(e) {
  try {
    var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var inventorySheet = activeSpreadsheet.getSheetByName("Inventory") || activeSpreadsheet.getActiveSheet();
    
    // Ensure sheet naming is consistent
    if (inventorySheet.getName() !== "Inventory") {
      inventorySheet.setName("Inventory");
    }
    
    // Auto-create Dispatches log tab if not exists
    var dispatchesSheet = activeSpreadsheet.getSheetByName("Dispatches");
    if (!dispatchesSheet) {
      dispatchesSheet = activeSpreadsheet.insertSheet("Dispatches");
      dispatchesSheet.appendRow(["Catalogue Number", "Customer", "Dispatch Date", "Tracking Details", "Quantity"]);
    }
    
    // 1. Fetch Inventory Data
    var invData = inventorySheet.getDataRange().getValues();
    var invHeaders = invData[0];
    var jsonInventory = [];
    
    for (var i = 1; i < invData.length; i++) {
      var row = invData[i];
      if (!row[1] && !row[4]) continue; // Skip empty rows (require product name or catalogue number)
      
      var record = {};
      for (var j = 0; j < invHeaders.length; j++) {
        record[invHeaders[j].toString().trim()] = row[j];
      }
      record["row_index"] = i + 1;
      jsonInventory.push(record);
    }
    
    // 2. Fetch Dispatches Log
    var dispData = dispatchesSheet.getDataRange().getValues();
    var dispHeaders = dispData[0];
    var jsonDispatches = [];
    
    for (var k = 1; k < dispData.length; k++) {
      var dRow = dispData[k];
      if (!dRow[0] && !dRow[1]) continue; // Skip empty rows
      
      var dRecord = {};
      for (var l = 0; l < dispHeaders.length; l++) {
        dRecord[dispHeaders[l].toString().trim()] = dRow[l];
      }
      dRecord["row_index"] = k + 1;
      jsonDispatches.push(dRecord);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      inventory: jsonInventory, 
      dispatches: jsonDispatches 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var inventorySheet = activeSpreadsheet.getSheetByName("Inventory") || activeSpreadsheet.getActiveSheet();
    var dispatchesSheet = activeSpreadsheet.getSheetByName("Dispatches");
    
    if (!dispatchesSheet) {
      dispatchesSheet = activeSpreadsheet.insertSheet("Dispatches");
      dispatchesSheet.appendRow(["Catalogue Number", "Customer", "Dispatch Date", "Tracking Details", "Quantity"]);
    }
    
    var params = JSON.parse(e.postData.contents);
    var action = params.action;
    
    if (action === "update") {
      var rowIndex = parseInt(params.row_index);
      var quantity = params.quantity; // e.g. "47 Pcs"
      
      // Update quantity (assuming Quantity is the 3rd column / C)
      inventorySheet.getRange(rowIndex, 3).setValue(quantity);
      
      // Send low-stock alert email if quantity is below 5
      var productName = inventorySheet.getRange(rowIndex, 2).getValue();
      var catalogueNumber = inventorySheet.getRange(rowIndex, 5).getValue();
      checkLowStockAndEmail(productName, catalogueNumber, quantity);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Quantity updated" }))
        .setMimeType(ContentService.MimeType.JSON);
    } 
    
    else if (action === "add") {
      var newNo = inventorySheet.getLastRow();
      
      // Append row: No., Product Name, Quantity, Condition, Catalogue Number, Specs, Image URL, Mfg Date, Arrival Date
      inventorySheet.appendRow([
        newNo,
        params.product_name || "",
        params.quantity || "0",
        params.condition || "",
        params.catalogue_number || "",
        params.specs || "",
        params.image_url || "",
        params.mfg_date || "",
        params.arrival_date || ""
      ]);
      
      // Send low-stock alert email if quantity is below 5
      checkLowStockAndEmail(params.product_name, params.catalogue_number, params.quantity);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Item added successfully" }))
        .setMimeType(ContentService.MimeType.JSON);
    } 
    
    else if (action === "update_field") {
      var rowIndex = parseInt(params.row_index);
      var column = parseInt(params.column);
      inventorySheet.getRange(rowIndex, column).setValue(params.value);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Field updated successfully" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (action === "delete") {
      var rowIndex = parseInt(params.row_index);
      inventorySheet.deleteRow(rowIndex);
      
      // Re-index the No. column (Column A) for all remaining items
      var lastRow = inventorySheet.getLastRow();
      for (var r = 2; r <= lastRow; r++) {
        inventorySheet.getRange(r, 1).setValue(r - 1);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Item deleted successfully" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (action === "bulk_import") {
      var items = params.items; 
      
      // Clear all rows except the header
      var lastRow = inventorySheet.getLastRow();
      if (lastRow > 1) {
        inventorySheet.deleteRows(2, lastRow - 1);
      }
      
      var lowStockItems = [];
      
      // Append the new rows
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        inventorySheet.appendRow([
          i + 1, // No.
          item["Product Name"] || "",
          item["Quantity"] || "0",
          item["Condition"] || "",
          item["Catalogue Number"] || "",
          item["Specs"] || "",
          item["Image URL"] || "",
          item["Mfg Date"] || "",
          item["Arrival Date"] || ""
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
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Bulk import complete" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (action === "forgot_password") {
      var recipient = Session.getActiveUser().getEmail() || SpreadsheetApp.getActiveSpreadsheet().getOwner().getEmail();
      if (recipient) {
        var subject = "🔑 ACX Instruments Dashboard Password Recovery";
        var body = "Dear Administrator,\n\n" +
                   "A password recovery request was triggered from your ACX Instruments Inventory Dashboard.\n\n" +
                   "• The current dashboard password is: ACXcam2026\n\n" +
                   "If you did not request this, please review your dashboard security settings.\n\n" +
                   "Best regards,\n" +
                   "ACX Instruments Inventory System";
        MailApp.sendEmail(recipient, subject, body);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Password recovery email sent" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (action === "dispatch") {
      // 1. Log to Dispatches Sheet
      dispatchesSheet.appendRow([
        params.catalogue_number || "",
        params.customer || "",
        params.dispatch_date || "",
        params.tracking_details || "",
        params.quantity || "0"
      ]);
      
      // 2. Adjust Stock Level in Inventory Sheet
      var invData = inventorySheet.getDataRange().getValues();
      var targetCat = params.catalogue_number;
      var dispatchQty = parseInt(params.quantity) || 0;
      
      for (var s = 1; s < invData.length; s++) {
        var catInRow = invData[s][4]; // Catalogue Number is column 5 / index 4
        if (targetCat && catInRow && catInRow.toString().trim() === targetCat.toString().trim()) {
          var currentQtyStr = invData[s][2].toString(); // Quantity is column 3 / index 2
          
          // Parse quantity and subtract
          var numberPart = parseInt(currentQtyStr) || 0;
          var textPart = currentQtyStr.replace(/^[0-9]+/, ''); // e.g. " Pcs" or " pcs"
          
          var newQtyNum = Math.max(0, numberPart - dispatchQty);
          var newQtyStr = newQtyNum + textPart;
          
          // Write back to sheet
          var sheetRowIndex = s + 1;
          inventorySheet.getRange(sheetRowIndex, 3).setValue(newQtyStr);
          
          // Email alert check
          checkLowStockAndEmail(invData[s][1], targetCat, newQtyStr);
          break;
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Product successfully dispatched and stock adjusted!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (action === "update_image") {
      var rowIndex = parseInt(params.row_index);
      // Save Base64 image string or URL in Column 7 (Column G / Images)
      inventorySheet.getRange(rowIndex, 7).setValue(params.image_data);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Image updated successfully" }))
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
