document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Replenish List
    const scanButton = document.getElementById('scanButton');
    const clearButton = document.getElementById('clearButton');
    const scannedItemsList = document.getElementById('scannedItemsList');
    const videoElement = document.getElementById('video');
    const scannerContainer = document.getElementById('scanner-container');
    const stopScanButton = document.getElementById('stopScanButton');
    const scanStatus = document.getElementById('scan-status');
    const csvFileInput = document.getElementById('csvFile');
    const dataStatus = document.getElementById('data-status');
    const manualBarcode = document.getElementById('manualBarcode');
    const manualAddButton = document.getElementById('manualAddButton');
    const manualStatus = document.getElementById('manual-status');
    const exportPdfButton = document.getElementById('exportPdfButton');

    // DOM Elements - WMS
    const toggleWmsButton = document.getElementById('toggleWmsButton');
    const wmsSection = document.getElementById('wms-section');
    const closeWmsButton = document.getElementById('closeWmsButton');
    const wmsScanButton = document.getElementById('wmsScanButton');
    const wmsBarcode = document.getElementById('wmsBarcode');
    const wmsProductCode = document.getElementById('wmsProductCode');
    const wmsPoNumber = document.getElementById('wmsPoNumber');
    const wmsSearchBarcode = document.getElementById('wmsSearchBarcode');
    const wmsSearchProductCode = document.getElementById('wmsSearchProductCode');
    const wmsSearchButton = document.getElementById('wmsSearchButton');
    const wmsSearchStatus = document.getElementById('wms-search-status');
    const wmsSearchResults = document.getElementById('wms-search-results');
    const wmsClearFormButton = document.getElementById('wmsClearFormButton'); // New Clear Button

    // Add references for multiple bin assignment rows
    const wmsBinInputs = [];
    const wmsAssignButtons = [];
    const wmsAssignStatuses = [];
    for (let i = 1; i <= 10; i++) { // Loop up to 10
        wmsBinInputs[i] = document.getElementById(`wmsBinCode-${i}`);
        wmsAssignButtons[i] = document.getElementById(`wmsAssignButton-${i}`);
        wmsAssignStatuses[i] = document.getElementById(`wmsAssignStatus-${i}`);
    }

    // State Variables
    let productData = {}; // Holds product info { barcode: { productCode, name, uom, bincode } }
    // UPDATED STRUCTURE: assignedBinCodes is now an array of 10
    let warehouseLocations = {}; // Holds WMS data { barcode: { productCode, name, poNumber, assignedBinCodes: [] } }
    let codeReader = null; // ZXing instance
    let isScanning = false;
    let currentScanTarget = null;
    const PRODUCT_DATA_STORAGE_KEY = 'barcodeScannerProductData';
    const WMS_DATA_STORAGE_KEY = 'barcodeScannerWMSData';

    // --- Data Management (Products) ---
    function loadProductDataFromLocalStorage() {
        const storedData = localStorage.getItem(PRODUCT_DATA_STORAGE_KEY);
        if (storedData) {
            try {
                productData = JSON.parse(storedData);
                const itemCount = Object.keys(productData).length;
                if (itemCount > 0) {
                    console.log(`Product data loaded from localStorage: ${itemCount} items`);
                    dataStatus.textContent = ` (${itemCount} items loaded)`;
                    dataStatus.style.color = 'green';
                    scanButton.disabled = false;
                    manualAddButton.disabled = false;
                    wmsScanButton.disabled = false;
                    wmsAssignButtons.forEach((btn, i) => { if(btn) btn.disabled = false; });
                    wmsSearchButton.disabled = false;
                    return true;
                }
            } catch (e) {
                console.error("Error parsing product data from localStorage", e);
                localStorage.removeItem(PRODUCT_DATA_STORAGE_KEY);
            }
        }
        console.log("No valid product data found in localStorage.");
        dataStatus.textContent = ' (No data loaded - Please upload CSV)';
        dataStatus.style.color = 'red';
        scanButton.disabled = true;
        manualAddButton.disabled = true;
        wmsScanButton.disabled = true;
        wmsAssignButtons.forEach((btn, i) => { if(btn) btn.disabled = true; });
        wmsSearchButton.disabled = true;
        return false;
    }

    function saveProductDataToLocalStorage() {
         const itemCount = Object.keys(productData).length;
        if (itemCount === 0) {
            console.warn("Attempted to save empty product data. Skipping.");
            return;
        }
        try {
            localStorage.setItem(PRODUCT_DATA_STORAGE_KEY, JSON.stringify(productData));
            console.log(`Product data (${itemCount} items) saved to localStorage.`);
        } catch (e) {
             console.error("Error saving product data to localStorage (maybe size limit exceeded?)", e);
             alert("Could not save product data for next time. Local storage might be full.");
             localStorage.removeItem(PRODUCT_DATA_STORAGE_KEY);
        }
    }

    function handleFileSelect(event) {
        console.log("handleFileSelect triggered.");
        const file = event.target.files[0];
        if (!file) {
            console.log("No file selected in event.");
            return;
        }
        console.log(`File selected: ${file.name}, Size: ${file.size}, Type: ${file.type}`);

        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert("Please select a valid .csv file.");
            console.warn("Invalid file type selected.");
            event.target.value = null;
            return;
        }

        dataStatus.textContent = ' (Reading file...)';
        dataStatus.style.color = '#666';
        scanButton.disabled = true;
        manualAddButton.disabled = true;
        wmsScanButton.disabled = true;
        wmsAssignButtons.forEach((btn, i) => { if(btn) btn.disabled = true; });
        wmsSearchButton.disabled = true;

        const reader = new FileReader();

        reader.onload = function(e) {
            console.log("FileReader onload event fired.");
            const csvText = e.target.result;
            if (csvText) {
                console.log(`CSV text loaded (first 500 chars):\n${csvText.substring(0, 500)}`);
                parseCsvDataAndStore(csvText, file.name);
            } else {
                 console.error("FileReader result is empty.");
                 alert("Could not read content from the file.");
                 dataStatus.textContent = ' (Error reading file content)';
                 dataStatus.style.color = 'red';
            }
            event.target.value = null;
        };

        reader.onerror = function(e) {
            console.error("FileReader error event:", e);
            alert(`Error reading file: ${file.name}. Check console.`);
            dataStatus.textContent = ' (Error reading file)';
            dataStatus.style.color = 'red';
            event.target.value = null;
        };

        reader.readAsText(file);
        console.log("FileReader readAsText called.");
    }

     function parseCsvDataAndStore(csvText, fileName) {
         console.log(`Attempting to parse CSV data from ${fileName || 'uploaded file'}...`);
         try {
             Papa.parse(csvText, {
                 header: true,
                 skipEmptyLines: true,
                 complete: function(results) {
                     console.log("PapaParse complete callback entered.");
                     console.log("Parsed results meta:", results.meta);
                     console.log("Parsed results errors:", results.errors);
                     console.log(`Parsed ${results.data.length} rows.`);

                     if (results.errors.length > 0) {
                         alert(`Errors found while parsing ${fileName || 'the file'}. Check console for details.`);
                         dataStatus.textContent = ' (Error parsing CSV)';
                         dataStatus.style.color = 'red';
                         productData = {};
                         localStorage.removeItem(PRODUCT_DATA_STORAGE_KEY);
                         return;
                     }

                     const requiredColumns = ['BARCODE', 'PRODUCTCODE', 'PRODUCTNAME', 'UOM', 'BINCODE'];
                     const actualHeaders = results.meta.fields.map(h => h ? h.trim().toUpperCase() : '') || [];
                     const requiredUpper = requiredColumns.map(col => col.toUpperCase());
                     const missingColumns = requiredUpper.filter(col => !actualHeaders.includes(col));

                     if (missingColumns.length > 0) {
                        console.error("CSV headers missing required columns:", missingColumns.join(', '));
                        alert(`Error processing CSV: Missing required columns: ${missingColumns.join(', ')}.\nFound headers: ${actualHeaders.join(', ')}`);
                        dataStatus.textContent = ' (CSV missing columns)';
                        dataStatus.style.color = 'red';
                        productData = {};
                        localStorage.removeItem(PRODUCT_DATA_STORAGE_KEY);
                        return;
                     }

                     console.log("Required columns found. Proceeding to populate productData.");
                     productData = {};
                     let validRows = 0;
                     results.data.forEach((row, index) => {
                         const barcode = row.BARCODE?.trim();
                         if (barcode) {
                             productData[barcode] = {
                                 productCode: row.PRODUCTCODE?.trim() || 'N/A',
                                 name: row.PRODUCTNAME?.trim() || 'N/A',
                                 uom: row.UOM?.trim() || 'N/A',
                                 bincode: row.BINCODE?.trim() || 'N/A'
                             };
                             validRows++;
                         } else {
                            if (index < 10) {
                                console.warn(`Skipping row ${index + 1} due to empty barcode:`, row);
                            } else if (index === 10) {
                                console.warn("Further empty barcode warnings suppressed.");
                            }
                         }
                     });

                     const itemCount = Object.keys(productData).length;
                     console.log(`Finished processing rows. ${itemCount} valid products stored.`);

                     if (itemCount > 0) {
                         console.log("Attempting to save product data to localStorage and update UI.");
                         saveProductDataToLocalStorage();
                         dataStatus.textContent = ` (${itemCount} items loaded)`;
                         dataStatus.style.color = 'green';
                         scanButton.disabled = false;
                         manualAddButton.disabled = false;
                         wmsScanButton.disabled = false;
                         wmsAssignButtons.forEach((btn, i) => { if(btn) btn.disabled = false; });
                         wmsSearchButton.disabled = false;
                         console.log("Scan, Add, and WMS buttons enabled.");
                         alert(`Successfully loaded ${itemCount} products from ${fileName || 'the file'}.`);
                     } else {
                         console.warn('The CSV file had no rows with valid barcodes.');
                         alert('The CSV file seems empty or had no valid product rows.');
                         dataStatus.textContent = ' (Loaded file was empty or invalid)';
                         dataStatus.style.color = 'orange';
                         scanButton.disabled = true;
                         manualAddButton.disabled = true;
                         wmsScanButton.disabled = true;
                         wmsAssignButtons.forEach((btn, i) => { if(btn) btn.disabled = true; });
                         wmsSearchButton.disabled = true;
                         localStorage.removeItem(PRODUCT_DATA_STORAGE_KEY);
                     }
                 },
                 error: function(error) {
                     console.error('PapaParse Error callback:', error);
                     alert(`Failed to parse CSV file: ${error.message}`);
                     dataStatus.textContent = ' (Error parsing CSV)';
                     dataStatus.style.color = 'red';
                      productData = {};
                      localStorage.removeItem(PRODUCT_DATA_STORAGE_KEY);
                 }
             });
         } catch (error) {
             console.error('Error within parseCsvDataAndStore function:', error);
             alert('An unexpected error occurred during parsing.');
              dataStatus.textContent = ' (Parsing error)';
              dataStatus.style.color = 'red';
              productData = {};
              localStorage.removeItem(PRODUCT_DATA_STORAGE_KEY);
         }
     }


    // --- Barcode Lookup (Products) ---
    function lookupBarcode(barcode) {
        return productData[barcode] || null;
    }

    // --- Display Logic (Replenish List) ---
    function displayItem(barcode, product) {
        const listItem = document.createElement('li');
        listItem.dataset.barcode = barcode;

         const existingItem = scannedItemsList.querySelector(`li[data-barcode="${barcode}"]`);
         if (existingItem) {
             console.log(`Barcode ${barcode} already in replenish list.`);
              if (currentScanTarget === 'replenish') {
                 scanStatus.textContent = `Already in replenish list: ${product.name}`;
              } else {
                 manualStatus.textContent = `Already in list!`;
                 manualStatus.style.color = 'orange';
              }
              existingItem.style.backgroundColor = '#fff3cd';
              setTimeout(() => { existingItem.style.backgroundColor = ''; }, 1000);
               setTimeout(() => {
                   if (currentScanTarget === 'replenish') scanStatus.textContent = 'Point camera at barcode...';
                   else manualStatus.textContent = '';
                }, 2000);
             return;
         }

        listItem.innerHTML = `
            <span>${barcode}</span>
            <span class="product-name">${product.name}</span>
            <span>${product.uom}</span>
            <span class="product-bincode">${product.bincode || 'N/A'}</span>
        `;
        scannedItemsList.prepend(listItem);

        if (currentScanTarget === 'replenish') {
            scanStatus.textContent = `Added to list: ${product.name}`;
            setTimeout(() => { if (isScanning) scanStatus.textContent = 'Point camera at barcode...'; }, 2000);
        }
    }

    function clearList() {
        scannedItemsList.innerHTML = '';
        console.log('Displayed replenish list cleared.');
    }

    // --- Scanning Logic ---
    async function startScan(scanPurpose) {
        if (isScanning) return;
        if (Object.keys(productData).length === 0) {
            alert("No product data loaded. Please upload a CSV file first.");
            return;
        }

        currentScanTarget = scanPurpose;
        console.log(`Starting scan for purpose: ${currentScanTarget}`);

        codeReader = new ZXing.BrowserMultiFormatReader();
        isScanning = true;

        scanButton.disabled = true;
        manualAddButton.disabled = true;
        wmsScanButton.disabled = true;
        wmsAssignButtons.forEach((btn, i) => { if(btn) btn.disabled = true; });
        wmsSearchButton.disabled = true;
        toggleWmsButton.disabled = true;

        stopScanButton.style.display = 'inline-block';
        scannerContainer.style.display = 'block';
        scanStatus.textContent = 'Requesting camera access...';

        try {
            console.log('Attempting to decode from video device...');
            scanStatus.textContent = 'Starting scanner... Point camera at barcode.';

            codeReader.decodeFromVideoDevice(undefined, 'video', (result, err) => {
                if (result) {
                    const barcode = result.text;
                    console.log('Scan successful:', barcode);
                    navigator.vibrate?.(100);
                    const product = lookupBarcode(barcode);

                    if (product) {
                        if (currentScanTarget === 'replenish') {
                            displayItem(barcode, product);
                        } else if (currentScanTarget === 'wms') {
                            wmsBarcode.value = barcode;
                            wmsProductCode.value = product.productCode || '';
                            scanStatus.textContent = `Populated WMS fields for: ${product.name}`;
                             populateExistingBinCodes(barcode);
                            stopScan();
                        }
                    } else {
                        console.log(`Barcode ${barcode} not found in product data.`);
                        scanStatus.textContent = `Barcode ${barcode} not found in data.`;
                        setTimeout(() => { if (isScanning) scanStatus.textContent = 'Point camera at barcode...'; }, 2000);
                    }
                }
                if (err && !(err instanceof ZXing.NotFoundException)) {
                    console.error('Scan error:', err);
                     if (err.name === 'NotAllowedError') {
                        scanStatus.textContent = 'Camera permission denied.';
                        alert('Camera permission was denied. Please allow camera access in your browser settings.');
                        stopScan();
                     } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                         scanStatus.textContent = 'No suitable camera found.';
                         alert('Could not find a suitable camera on this device.');
                         stopScan();
                     } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                          scanStatus.textContent = 'Camera is already in use or cannot be read.';
                          alert('Could not start the camera. It might be used by another application or browser tab.');
                          stopScan();
                     }
                     else {
                         scanStatus.textContent = 'Scanning error. Try again.';
                     }
                    setTimeout(() => { if (isScanning) scanStatus.textContent = 'Point camera at barcode...'; }, 3000);
                }
            });

            console.log(`Decode operation started successfully.`);

        } catch (error) {
            console.error('Error setting up scanner:', error);
            alert(`Error accessing camera or starting scan: ${error.message}`);
            scanStatus.textContent = 'Camera setup failed.';
            stopScan();
        }
    }

     function stopScan() {
        if (codeReader) {
            codeReader.reset();
            console.log('ZXing code reader reset.');
        }
        if (videoElement.srcObject) {
             videoElement.srcObject.getTracks().forEach(track => track.stop());
             videoElement.srcObject = null;
             console.log('Video tracks stopped.');
        }

        isScanning = false;
        currentScanTarget = null;

        const dataLoaded = Object.keys(productData).length > 0;
        scanButton.disabled = !dataLoaded;
        manualAddButton.disabled = !dataLoaded;
        wmsScanButton.disabled = !dataLoaded;
        wmsAssignButtons.forEach((btn, i) => { if(btn) btn.disabled = !dataLoaded; });
        wmsSearchButton.disabled = !dataLoaded;
        toggleWmsButton.disabled = false;

        stopScanButton.style.display = 'none';
        scannerContainer.style.display = 'none';
        if (!scanStatus.textContent.includes('denied') && !scanStatus.textContent.includes('failed') && !scanStatus.textContent.includes('Populated')) {
            scanStatus.textContent = 'Scanner stopped.';
        }
         setTimeout(() => { scanStatus.textContent = 'Point camera at barcode...'; }, 3000);
        console.log('Scanning stopped.');
    }

    // --- Manual Add Logic (Replenish List) ---
    function handleManualAdd() {
        const barcodeValue = manualBarcode.value.trim();
        manualStatus.textContent = '';

        if (!barcodeValue) {
            manualStatus.textContent = 'Please enter a barcode.';
            manualStatus.style.color = 'orange';
            return;
        }

        if (Object.keys(productData).length === 0) {
            manualStatus.textContent = 'Product data not loaded.';
            manualStatus.style.color = 'red';
            return;
        }

        console.log(`Manual lookup for replenish list barcode: ${barcodeValue}`);
        const product = lookupBarcode(barcodeValue);

        if (product) {
            currentScanTarget = 'manual_replenish';
            displayItem(barcodeValue, product);
            manualBarcode.value = '';
            manualStatus.textContent = 'Added to list!';
            manualStatus.style.color = 'green';
            currentScanTarget = null;
        } else {
            console.log(`Manual barcode ${barcodeValue} not found.`);
            manualStatus.textContent = 'Barcode not found!';
            manualStatus.style.color = 'red';
        }
        setTimeout(() => { manualStatus.textContent = ''; }, 3000);
    }

    // --- PDF Export Logic (Replenish List) ---
    function exportToPdf() {
        console.log("Export to PDF triggered for Replenish List.");
        const listItems = scannedItemsList.querySelectorAll('li');

        if (listItems.length === 0) {
            alert("The replenish items list is empty. Nothing to export.");
            console.log("Export aborted: Replenish list is empty.");
            return;
        }

        const tableHeaders = ["Barcode", "Product Name", "UOM", "Bin Code (from CSV)"];
        const tableData = [];

        listItems.forEach(item => {
            const barcode = item.querySelector('span:nth-child(1)')?.textContent || '';
            const productInfo = productData[barcode];

            const name = productInfo?.name || item.querySelector('span.product-name')?.textContent || '';
            const uom = productInfo?.uom || item.querySelector('span:nth-child(3)')?.textContent || '';
            const bincode = productInfo?.bincode || item.querySelector('span.product-bincode')?.textContent || '';

            const rowData = [barcode, name, uom, bincode];
            tableData.push(rowData);
        });

        tableData.reverse();

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            doc.setFontSize(16);
            doc.text("Replenish Product List", 14, 15);

            let columnStyles = {
                 0: { cellWidth: 35 },
                 1: { cellWidth: 'auto'},
                 2: { cellWidth: 15 },
                 3: { cellWidth: 35 }
            };

            doc.autoTable({
                head: [tableHeaders],
                body: tableData,
                startY: 25,
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [22, 160, 133], fontSize: 9 },
                columnStyles: columnStyles
            });

            const now = new Date();
            const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
            const filename = `replenish_list_${timestamp}.pdf`;

            doc.save(filename);
            console.log(`PDF exported as ${filename}`);

        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("An error occurred while generating the PDF. Check the console.");
        }
    }

    // --- WMS Logic ---

    function toggleWmsView() {
        if (wmsSection.style.display === 'none') {
            wmsSection.style.display = 'block';
            toggleWmsButton.textContent = 'Hide Warehouse Management';
        } else {
            wmsSection.style.display = 'none';
            toggleWmsButton.textContent = 'Manage Warehouse Locations';
            stopScan();
        }
    }

    function loadWmsDataFromLocalStorage() {
        const storedData = localStorage.getItem(WMS_DATA_STORAGE_KEY);
        if (storedData) {
            try {
                warehouseLocations = JSON.parse(storedData);
                console.log(`WMS data loaded from localStorage: ${Object.keys(warehouseLocations).length} items mapped.`);
            } catch (e) {
                console.error("Error parsing WMS data from localStorage", e);
                localStorage.removeItem(WMS_DATA_STORAGE_KEY);
                warehouseLocations = {};
            }
        } else {
            console.log("No WMS data found in localStorage.");
            warehouseLocations = {};
        }
    }

    function saveWmsDataToLocalStorage() {
        try {
            localStorage.setItem(WMS_DATA_STORAGE_KEY, JSON.stringify(warehouseLocations));
            console.log(`WMS data (${Object.keys(warehouseLocations).length} items) saved to localStorage.`);
        } catch (e) {
             console.error("Error saving WMS data to localStorage", e);
             alert("Could not save WMS location data. Local storage might be full.");
        }
    }

    function validateBinCode(binCode) {
        if (!binCode) return true; // Allow empty for clearing
        const pattern = /^[A-H](0[1-6])$/i;
        return pattern.test(binCode);
    }

    function populateExistingBinCodes(barcode) {
        const wmsData = warehouseLocations[barcode];
        clearBinCodeInputs();
        if (wmsData && Array.isArray(wmsData.assignedBinCodes)) {
            wmsData.assignedBinCodes.forEach((bin, index) => {
                // Use index+1 because wmsBinInputs array is 1-based index
                if (bin && wmsBinInputs[index + 1]) {
                    wmsBinInputs[index + 1].value = bin;
                }
            });
        }
    }

    function clearBinCodeInputs() {
        for (let i = 1; i <= 10; i++) { // Changed to 10
            if (wmsBinInputs[i]) wmsBinInputs[i].value = '';
            if (wmsAssignStatuses[i]) wmsAssignStatuses[i].textContent = '';
        }
    }

    // New function to clear the main WMS assignment form
    function clearWmsAssignmentForm() {
        wmsBarcode.value = '';
        wmsProductCode.value = '';
        wmsPoNumber.value = '';
        clearBinCodeInputs(); // Clears all 10 bin inputs and statuses
        console.log("WMS Assignment Form cleared.");
        wmsBarcode.focus();
    }


    function handleWmsAssignUpdate(index) {
        const currentStatusSpan = wmsAssignStatuses[index];
        const currentBinInput = wmsBinInputs[index];
        currentStatusSpan.textContent = '';

        const barcode = wmsBarcode.value.trim();
        const productCode = wmsProductCode.value.trim();
        const poNumber = wmsPoNumber.value.trim();
        const binCode = currentBinInput.value.trim().toUpperCase();

        if (!barcode) {
            alert('Please enter or scan a Barcode first.');
            wmsBarcode.focus();
            return;
        }
        if (!productCode) {
            alert('Please enter a Product Code first.');
            wmsProductCode.focus();
            return;
        }
        if (binCode && !validateBinCode(binCode)) {
            currentStatusSpan.textContent = 'Invalid format (e.g., A01).';
            currentStatusSpan.style.color = 'red';
            return;
        }

        const productInfo = lookupBarcode(barcode);
        if (!productInfo) {
            alert(`Barcode ${barcode} not found in main product data. Cannot assign location.`);
            return;
        }

        // Get existing WMS data or initialize
        if (!warehouseLocations[barcode]) {
            warehouseLocations[barcode] = {
                productCode: productCode,
                name: productInfo.name,
                poNumber: poNumber || 'N/A',
                assignedBinCodes: Array(10).fill(null) // Changed to 10
            };
        } else {
            warehouseLocations[barcode].productCode = productCode;
            warehouseLocations[barcode].name = productInfo.name;
            warehouseLocations[barcode].poNumber = poNumber || 'N/A';
            if (!Array.isArray(warehouseLocations[barcode].assignedBinCodes)) {
                 warehouseLocations[barcode].assignedBinCodes = Array(10).fill(null); // Changed to 10
            } else {
                // Ensure array has 10 slots, pad if needed
                while (warehouseLocations[barcode].assignedBinCodes.length < 10) { // Changed to 10
                    warehouseLocations[barcode].assignedBinCodes.push(null);
                }
            }
        }

        // Assign or clear the bin code
        const newBinValue = binCode === '' ? null : binCode;
        warehouseLocations[barcode].assignedBinCodes[index - 1] = newBinValue;

        // Check if all bins are now null for this entry
        const allBinsNull = warehouseLocations[barcode].assignedBinCodes.every(bin => bin === null);

        if (allBinsNull) {
            delete warehouseLocations[barcode];
            console.log(`Removed WMS entry for Barcode ${barcode} as all bins were cleared.`);
            currentStatusSpan.textContent = `Bin ${index} cleared. Entry removed.`;
            currentStatusSpan.style.color = 'orange';
        } else {
             console.log(`Assigned/Updated Bin ${index} for Barcode ${barcode}: ${newBinValue || 'Cleared'}`, warehouseLocations[barcode]);
             currentStatusSpan.textContent = `Bin ${index} ${newBinValue ? 'set to ' + newBinValue : 'cleared'}!`;
             currentStatusSpan.style.color = 'green';
        }


        saveWmsDataToLocalStorage();
        // currentBinInput.value = ''; // Clear input after assignment/clearance - removed as per user request implicit in prior state

        setTimeout(() => { currentStatusSpan.textContent = ''; }, 4000);
    }


    function handleWmsSearch() {
        wmsSearchStatus.textContent = '';
        wmsSearchResults.innerHTML = '';
        const searchBarcode = wmsSearchBarcode.value.trim();
        const searchProductCode = wmsSearchProductCode.value.trim();

        if (!searchBarcode && !searchProductCode) {
            wmsSearchStatus.textContent = 'Enter a Barcode or Product Code to search.';
            wmsSearchStatus.style.color = 'orange';
            wmsSearchResults.innerHTML = '<p>Enter Barcode or Product Code above and click Search.</p>';
            return;
        }

        let foundItems = [];

        if (searchBarcode) {
            const locationData = warehouseLocations[searchBarcode];
            if (locationData) {
                foundItems.push({ barcode: searchBarcode, data: locationData });
            }
        } else if (searchProductCode) {
            for (const barcode in warehouseLocations) {
                const locationData = warehouseLocations[barcode];
                if (locationData.productCode && locationData.productCode.toLowerCase() === searchProductCode.toLowerCase()) {
                    foundItems.push({ barcode: barcode, data: locationData });
                }
            }
        }

        if (foundItems.length > 0) {
            let resultsHTML = '';
            foundItems.forEach(item => {
                const locationData = item.data;
                const assignedBins = (locationData.assignedBinCodes || [])
                                      .filter(bin => bin !== null && bin !== '')
                                      .map(bin => `<strong>${bin}</strong>`)
                                      .join(', ') || 'N/A';

                resultsHTML += `
                    <div class="wms-result-item" data-barcode="${item.barcode}">
                        <p>
                           <strong>${locationData.name}</strong><br>
                           Barcode: ${item.barcode} | Code: ${locationData.productCode} | PO: ${locationData.poNumber}
                        </p>
                        <div class="location-info">
                            <span class="location-display">Locations: ${assignedBins}</span>
                         </div>
                        <button class="load-to-form-button result-action-button">Load to Form</button>
                        <button class="delete-wms-button result-action-button">Delete Entry</button>
                    </div>`;
            });

            wmsSearchResults.innerHTML = resultsHTML;
            wmsSearchStatus.textContent = `${foundItems.length} product(s) found!`;
            wmsSearchStatus.style.color = 'green';
        } else {
            wmsSearchResults.innerHTML = `<p>No location assigned for the specified ${searchBarcode ? 'barcode' : 'product code'} in the WMS data.</p>`;
            wmsSearchStatus.textContent = 'Location not found.';
            wmsSearchStatus.style.color = 'red';
        }
        setTimeout(() => { wmsSearchStatus.textContent = ''; }, 5000);
    }


    // --- Event Listeners ---
    csvFileInput.addEventListener('change', handleFileSelect, false);
    scanButton.addEventListener('click', () => startScan('replenish'));
    clearButton.addEventListener('click', clearList);
    stopScanButton.addEventListener('click', stopScan);
    manualAddButton.addEventListener('click', handleManualAdd);
    exportPdfButton.addEventListener('click', exportToPdf);
    manualBarcode.addEventListener('keydown', (event) => {
        manualStatus.textContent = '';
        if (event.key === 'Enter') {
            event.preventDefault();
            handleManualAdd();
        }
    });

    // WMS Event Listeners
    toggleWmsButton.addEventListener('click', toggleWmsView);
    closeWmsButton.addEventListener('click', toggleWmsView);
    wmsScanButton.addEventListener('click', () => startScan('wms'));
    wmsSearchButton.addEventListener('click', handleWmsSearch);
    wmsClearFormButton.addEventListener('click', clearWmsAssignmentForm); // Listener for new button
    wmsSearchBarcode.addEventListener('keydown', (event) => {
         wmsSearchProductCode.value = '';
        if (event.key === 'Enter') {
            event.preventDefault();
            handleWmsSearch();
        }
    });
    wmsSearchProductCode.addEventListener('keydown', (event) => {
         wmsSearchBarcode.value = '';
        if (event.key === 'Enter') {
            event.preventDefault();
            handleWmsSearch();
        }
    });
    wmsBarcode.addEventListener('change', () => populateExistingBinCodes(wmsBarcode.value.trim()));
    wmsProductCode.addEventListener('change', () => {
        const productCode = wmsProductCode.value.trim().toLowerCase();
        let foundBarcode = null;
        for (const bc in productData) {
            if (productData[bc].productCode?.toLowerCase() === productCode) {
                foundBarcode = bc;
                wmsBarcode.value = bc;
                break;
            }
        }
        populateExistingBinCodes(foundBarcode);
    });

    // ADD Listeners for multiple assignment rows
    for (let i = 1; i <= 10; i++) { // Changed to 10
        if (wmsAssignButtons[i]) {
            wmsAssignButtons[i].addEventListener('click', (event) => {
                const index = event.target.dataset.index;
                handleWmsAssignUpdate(parseInt(index));
            });
        }
        if (wmsBinInputs[i]) {
             wmsBinInputs[i].addEventListener('input', (event) => {
                event.target.value = event.target.value.toUpperCase();
            });
            wmsBinInputs[i].addEventListener('keydown', (event) => {
                 if (event.key === 'Enter') {
                    event.preventDefault();
                    const index = event.target.id.split('-')[1];
                     handleWmsAssignUpdate(parseInt(index));
                }
            });
        }
    }

    // --- Event Listener for WMS Search Results Actions (Load/Delete) ---
    wmsSearchResults.addEventListener('click', (event) => {
        const target = event.target;
        const resultItem = target.closest('.wms-result-item');

        if (!resultItem) return;

        const barcode = resultItem.dataset.barcode;

        if (target.classList.contains('load-to-form-button')) {
            // --- LOAD TO FORM ACTION ---
            console.log(`Loading data for barcode ${barcode} to assignment form.`);
            const wmsData = warehouseLocations[barcode];

            if (wmsData) {
                wmsBarcode.value = barcode;
                wmsProductCode.value = wmsData.productCode || '';
                wmsPoNumber.value = wmsData.poNumber !== 'N/A' ? wmsData.poNumber : '';

                clearBinCodeInputs();
                if (Array.isArray(wmsData.assignedBinCodes)) {
                    wmsData.assignedBinCodes.forEach((bin, index) => {
                        if (bin && wmsBinInputs[index + 1]) {
                            wmsBinInputs[index + 1].value = bin;
                        }
                    });
                }

                wmsSearchStatus.textContent = `Loaded ${wmsData.name} data into form.`;
                wmsSearchStatus.style.color = 'blue';
                setTimeout(() => { wmsSearchStatus.textContent = ''; }, 3000);

                 wmsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                 wmsBarcode.focus();

            } else {
                console.error(`Could not find WMS data for barcode ${barcode} when trying to load.`);
                wmsSearchStatus.textContent = 'Error: Could not load data.';
                wmsSearchStatus.style.color = 'red';
                 setTimeout(() => { wmsSearchStatus.textContent = ''; }, 3000);
            }

        } else if (target.classList.contains('delete-wms-button')) {
            // --- DELETE ACTION ---
            console.log(`Attempting to delete location data for barcode: ${barcode}`);
            const productName = warehouseLocations[barcode]?.name || 'this product';
            const assignedBins = (warehouseLocations[barcode]?.assignedBinCodes || [])
                                      .filter(bin => bin !== null && bin !== '')
                                      .join(', ') || 'N/A';

            if (window.confirm(`Are you sure you want to delete the WMS entry for ${productName} (Barcode: ${barcode}) with locations [${assignedBins}]? This action removes all assigned bins for this product and cannot be undone.`)) {
                console.log(`User confirmed deletion for barcode: ${barcode}`);

                if (warehouseLocations[barcode]) {
                    delete warehouseLocations[barcode];
                    saveWmsDataToLocalStorage();
                    resultItem.remove();
                    console.log(`Successfully deleted WMS data for barcode: ${barcode}`);

                    wmsSearchStatus.textContent = `WMS entry for ${productName} deleted.`;
                    wmsSearchStatus.style.color = 'green';
                     setTimeout(() => { wmsSearchStatus.textContent = ''; }, 4000);
                } else {
                    console.error(`Could not find WMS data for barcode ${barcode} during deletion attempt.`);
                    wmsSearchStatus.textContent = 'Error: Could not find item to delete.';
                    wmsSearchStatus.style.color = 'red';
                     setTimeout(() => { wmsSearchStatus.textContent = ''; }, 4000);
                }
            } else {
                console.log(`User cancelled deletion for barcode: ${barcode}`);
            }
        }
    });


    // --- Initial Load ---
    loadProductDataFromLocalStorage();
    loadWmsDataFromLocalStorage();

});