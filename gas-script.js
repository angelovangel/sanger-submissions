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
            var existingIds = {};
            if (destSheet.getLastRow() > 1 && infinityIdx !== undefined) {
                var destData = destSheet.getRange(2, infinityIdx + 1, destSheet.getLastRow() - 1, 1).getValues();
                for (var j = 0; j < destData.length; j++) {
                    existingIds[String(destData[j][0]).trim()] = true;
                }
            }

            payload.forEach(function (rowObj) {
                var infId = String(rowObj['Infinity']).trim();
                if (existingIds[infId]) {
                    return; // Skip if already exists
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
                existingIds[infId] = true;
            });
        }

        return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    } catch (error) {
        return ContentService.createTextOutput("Error: " + error.toString()).setMimeType(ContentService.MimeType.TEXT);
    }
}
