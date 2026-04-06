function doPost(e) {
    try {
        var rawData = e.postData.contents;
        var payload = JSON.parse(rawData);
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var destSheet = ss.getActiveSheet(); // or ss.getSheetByName("Name of Destination Sheet")

        // --- USER MAPPING LOGIC --- //
        var usersSheet = ss.getSheetByName("users");
        var userMap = {};
        if (usersSheet) {
            // Mapping based on: ID (Col 0), Name (Col 1), Portal ID (Col 2), Email (Col 3)
            var usersData = usersSheet.getDataRange().getValues();
            for (var i = 1; i < usersData.length; i++) { // Starting from 1 skips headers
                var email = String(usersData[i][3]).toLowerCase().trim();
                var id = usersData[i][0];
                userMap[email] = id;
            }
        }

        if (payload.length > 0) {
            // Map Column Names to their Indexes (0-based)
            var headers = destSheet.getRange(1, 1, 1, destSheet.getLastColumn()).getValues()[0];
            var colIndexMap = {};
            headers.forEach(function (head, idx) {
                if (head) colIndexMap[String(head).trim()] = idx;
            });

            // Get existing Infinity IDs to prevent duplicates (using mapped index)
            var infinityIdx = colIndexMap["Infinity"];
            var receivedIdx = colIndexMap["Received"];
            var existingIds = {};
            if (destSheet.getLastRow() > 1 && infinityIdx !== undefined) {
                var dataStartRow = 2;
                var numRows = destSheet.getLastRow() - 1;
                var destData = destSheet.getRange(dataStartRow, infinityIdx + 1, numRows, 1).getValues();
                var receivedData = (receivedIdx !== undefined)
                    ? destSheet.getRange(dataStartRow, receivedIdx + 1, numRows, 1).getValues()
                    : null;
                for (var j = 0; j < destData.length; j++) {
                    var existingId = String(destData[j][0]).trim();
                    if (existingId) {
                        existingIds[existingId] = {
                            row: dataStartRow + j,
                            received: receivedData ? String(receivedData[j][0]).trim() : ""
                        };
                    }
                }
            }

            payload.forEach(function (rowObj) {
                var infId = String(rowObj['Infinity']).trim();
                if (existingIds[infId]) {
                    // Update Received if it was empty but now has a value
                    var newReceived = rowObj['Received'] || "";
                    if (newReceived && !existingIds[infId].received && receivedIdx !== undefined) {
                        destSheet.getRange(existingIds[infId].row, receivedIdx + 1).setValue(newReceived);
                        existingIds[infId].received = newReceived;
                    }
                    return; // Skip inserting a new row
                }

                var rawEmail = String(rowObj['User']).toLowerCase().trim();
                var mappedUser = userMap[rawEmail] || "";
                var randomId = Math.random().toString(36).substring(2, 10);

                // Build a row that matches current sheet structure
                var rowData = [new Array(headers.length)];
                
                // Map values to their discovered columns!
                if (colIndexMap["ID"] !== undefined) rowData[0][colIndexMap["ID"]] = randomId;
                if (colIndexMap["Infinity"] !== undefined) rowData[0][colIndexMap["Infinity"]] = rowObj['Infinity'];
                if (colIndexMap["User"] !== undefined) rowData[0][colIndexMap["User"]] = mappedUser;
                if (colIndexMap["Reactions"] !== undefined) rowData[0][colIndexMap["Reactions"]] = rowObj['Reactions'];
                if (colIndexMap["Received"] !== undefined) rowData[0][colIndexMap["Received"]] = rowObj['Received'] || "";
                if (colIndexMap["Status"] !== undefined) rowData[0][colIndexMap["Status"]] = "New";

                var targetRow = destSheet.getLastRow() + 1;
                var targetRange = destSheet.getRange(targetRow, 1, 1, headers.length);
                
                // Inherit format from the previous row
                if (targetRow > 2) {
                    var prevRange = destSheet.getRange(targetRow - 1, 1, 1, headers.length);
                    prevRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
                }

                targetRange.setValues(rowData);
                
                // Track internally per batch
                existingIds[infId] = { row: targetRow, received: rowObj['Received'] || "" };
            });
        }

        return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    } catch (error) {
        return ContentService.createTextOutput("Error: " + error.toString()).setMimeType(ContentService.MimeType.TEXT);
    }
}
