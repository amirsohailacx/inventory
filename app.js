// App State
let inventoryData = [];
let dispatchesData = []; // Store customer dispatches history
let activeProduct = null; // Track current product in details modal
let googleScriptUrl = localStorage.getItem('google_inventory_api_url') || 'https://script.google.com/macros/s/AKfycbwPwW6IFEkMV4ORdUgyhxta67aijDYncvub_CEDjyn8eVPvxcfL2D0YdBmsphK2RERV/exec';
let currentFilter = 'all';
let currentExcelData = null; // Stored parsed excel sheets
let sortColumn = null;
let sortDirection = 'asc'; // 'asc' or 'desc'

// DOM Elements
const tabs = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const tabTitle = document.getElementById('tab-title');
const connectionStatus = document.getElementById('connection-status');
const statusText = connectionStatus.querySelector('.status-text');
const setupAlertBanner = document.getElementById('setup-alert-banner');
const refreshBtn = document.getElementById('refresh-btn');
const exportBtn = document.getElementById('export-btn');
const toastEl = document.getElementById('toast');
const themeSwitch = document.getElementById('theme-switch');

// Settings Fields
const settingsApiUrlInput = document.getElementById('settings-api-url');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// Form Fields
const addProductForm = document.getElementById('add-product-form');
const addSubmitBtn = document.getElementById('add-submit-btn');

// Table DOM
const inventoryTbody = document.getElementById('inventory-tbody');
const searchInput = document.getElementById('search-input');
const filterBtns = document.querySelectorAll('.filter-btn');
const sortableHeaders = document.querySelectorAll('.sortable-header');

// Stats DOM
const statTotalProducts = document.getElementById('stat-total-products');
const statTotalStock = document.getElementById('stat-total-stock');
const statLowStock = document.getElementById('stat-low-stock');

// Excel Import DOM
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const importPreviewSection = document.getElementById('import-preview-section');
const mapNameSelect = document.getElementById('map-name');
const mapQuantitySelect = document.getElementById('map-quantity');
const mapConditionSelect = document.getElementById('map-condition');
const mapCatalogueSelect = document.getElementById('map-catalogue');
const mapImageSelect = document.getElementById('map-image');
const mapMfgSelect = document.getElementById('map-mfg');
const mapArrivalSelect = document.getElementById('map-arrival');
const mapSpecsSelect = document.getElementById('map-specs');
const confirmImportBtn = document.getElementById('confirm-import-btn');
const cancelImportBtn = document.getElementById('cancel-import-btn');
const importCountBadge = document.getElementById('import-count-badge');

// ========================================================
// Security / Login Gate Verification
// ========================================================
const CORRECT_PASSWORD_HASH = "bf1fc10e3fd218e89dc1a62afd533478305bf3f1397bacb7a619ad88b102a570"; // ACXcam2026

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function unlockDashboard() {
    document.getElementById('login-gate').classList.add('hidden');
    document.getElementById('app-wrapper').classList.remove('hidden');
    
    // Fetch latest data if URL is configured
    if (googleScriptUrl) {
        fetchInventory();
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Check if already authenticated in sessionStorage
    if (sessionStorage.getItem('authenticated') === 'true') {
        unlockDashboard();
    } else {
        // Handle login submission
        const loginForm = document.getElementById('login-form');
        const loginError = document.getElementById('login-error');
        const forgotPasswordBtn = document.getElementById('forgot-password-btn');
        const forgotPasswordStatus = document.getElementById('forgot-password-status');
        
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const passwordInput = document.getElementById('login-password');
            const hashedInput = await sha256(passwordInput.value);
            
            if (hashedInput === CORRECT_PASSWORD_HASH) {
                sessionStorage.setItem('authenticated', 'true');
                loginError.classList.add('hidden');
                unlockDashboard();
            } else {
                loginError.classList.remove('hidden');
                passwordInput.value = '';
                passwordInput.focus();
            }
        });

        forgotPasswordBtn.addEventListener('click', async () => {
            if (!googleScriptUrl) {
                forgotPasswordStatus.className = 'forgot-password-status error';
                forgotPasswordStatus.textContent = '❌ Connection error: Database URL not set.';
                forgotPasswordStatus.classList.remove('hidden');
                return;
            }

            forgotPasswordBtn.disabled = true;
            forgotPasswordStatus.className = 'forgot-password-status';
            forgotPasswordStatus.textContent = 'Sending recovery email...';
            forgotPasswordStatus.classList.remove('hidden');

            try {
                // Post forgot password request to Apps Script
                await fetch(googleScriptUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'forgot_password' })
                });

                forgotPasswordStatus.className = 'forgot-password-status success';
                forgotPasswordStatus.textContent = '📨 The password has been emailed to the Google account owner!';
            } catch (err) {
                forgotPasswordStatus.className = 'forgot-password-status error';
                forgotPasswordStatus.textContent = '❌ Failed to send request. Check your connection.';
            } finally {
                forgotPasswordBtn.disabled = false;
            }
        });
    }

    // Initialize Theme (Default is dark mode, check local storage)
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        themeSwitch.checked = false;
    } else {
        document.body.classList.remove('light-theme');
        themeSwitch.checked = true;
    }

    // Toggle Theme Event
    themeSwitch.addEventListener('change', () => {
        if (themeSwitch.checked) {
            document.body.classList.remove('light-theme');
            localStorage.setItem('theme', 'dark');
            showToast("Dark Mode activated", "success");
        } else {
            document.body.classList.add('light-theme');
            localStorage.setItem('theme', 'light');
            showToast("Light Mode activated", "success");
        }
    });

    // Populate settings URL if saved
    if (googleScriptUrl) {
        settingsApiUrlInput.value = googleScriptUrl;
        updateConnectionStatus(true, "Connected");
        // Note: fetchInventory is called in unlockDashboard if logged in
    } else {
        updateConnectionStatus(false, "Setup Required");
        setupAlertBanner.classList.remove('hidden');
        renderEmptyState("Please connect your Google Sheet in the Settings tab first.");
    }

    // Set up Tab Switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const contentId = tab.getAttribute('data-tab');
            document.getElementById(contentId).classList.add('active');
            
            // Update Title
            tabTitle.textContent = tab.textContent.trim();
        });
    });

    // Save Settings Event
    saveSettingsBtn.addEventListener('click', () => {
        const url = settingsApiUrlInput.value.trim();
        if (!url) {
            showToast("Please enter a valid Web App URL", "error");
            return;
        }
        
        googleScriptUrl = url;
        localStorage.setItem('google_inventory_api_url', url);
        setupAlertBanner.classList.add('hidden');
        updateConnectionStatus(true, "Connecting...");
        showToast("Settings saved. Connecting...", "success");
        fetchInventory();
    });

    // Sync Button
    refreshBtn.addEventListener('click', () => {
        if (!googleScriptUrl) {
            showToast("No Google Sheet connected.", "warning");
            return;
        }
        fetchInventory();
    });

    // Export Current View Button
    exportBtn.addEventListener('click', exportToCSV);

    // Search and Filter Events
    searchInput.addEventListener('input', applyFiltersAndRender);
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            applyFiltersAndRender();
        });
    });

    // Sorting Headers Click Event
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-sort');
            
            if (sortColumn === column) {
                // Toggle direction
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }

            // Update Header Sort Icons
            sortableHeaders.forEach(h => {
                h.classList.remove('asc', 'desc');
                const icon = h.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-sort';
            });

            header.classList.add(sortDirection);
            const headerIcon = header.querySelector('i');
            if (headerIcon) {
                headerIcon.className = sortDirection === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
            }

            applyFiltersAndRender();
        });
    });

    // Add Product Form Submit
    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!googleScriptUrl) {
            showToast("Please connect to Google Sheets in Settings first.", "error");
            return;
        }

        const name = document.getElementById('new-product-name').value.trim();
        const quantity = document.getElementById('new-quantity').value.trim();
        const condition = document.getElementById('new-condition').value.trim();
        const catalogue = document.getElementById('new-catalogue-number').value.trim();
        const imageUrl = document.getElementById('new-image-url').value.trim();
        const mfgDate = document.getElementById('new-mfg-date').value;
        const arrivalDate = document.getElementById('new-arrival-date').value;
        const specs = document.getElementById('new-specs').value.trim();

        addSubmitBtn.disabled = true;
        addSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding Product...';

        try {
            const response = await fetch(googleScriptUrl, {
                method: 'POST',
                mode: 'no-cors', // Apps Script requires no-cors for direct browser post
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: "add",
                    product_name: name,
                    quantity: quantity,
                    condition: condition,
                    catalogue_number: catalogue,
                    image_url: imageUrl,
                    mfg_date: mfgDate,
                    arrival_date: arrivalDate,
                    specs: specs
                })
            });

            showToast("Product added successfully! Refreshing database...", "success");
            addProductForm.reset();
            
            // Switch back to Dashboard tab
            document.querySelector('[data-tab="dashboard-tab"]').click();
            
            // Fetch latest data (give Apps Script a brief second to write)
            setTimeout(fetchInventory, 1500);

        } catch (error) {
            console.error("Error adding product:", error);
            showToast("Failed to add product.", "error");
        } finally {
            addSubmitBtn.disabled = false;
            addSubmitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Product';
        }
    });

    // Excel Drag and Drop Setup
    setupDragAndDrop();
});

// Toast system
function showToast(message, type = "success") {
    toastEl.textContent = message;
    toastEl.className = `toast ${type}`;
    toastEl.classList.remove('hidden');
    setTimeout(() => {
        toastEl.classList.add('hidden');
    }, 4000);
}

// Connection Indicator
function updateConnectionStatus(isOnline, text) {
    if (isOnline) {
        connectionStatus.classList.remove('offline');
        connectionStatus.classList.add('online');
    } else {
        connectionStatus.classList.remove('online');
        connectionStatus.classList.add('offline');
    }
    statusText.textContent = text;
}

// Fetch Inventory from Google Sheet
async function fetchInventory() {
    if (!googleScriptUrl) return;

    renderLoadingState();
    updateConnectionStatus(true, "Syncing...");

    try {
        const res = await fetch(googleScriptUrl);
        const result = await res.json();
        
        if (result.status === "success") {
            inventoryData = result.inventory || result.data || [];
            dispatchesData = result.dispatches || [];
            updateConnectionStatus(true, "Connected");
            applyFiltersAndRender();
        } else {
            throw new Error(result.message || "Failed to fetch data");
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        updateConnectionStatus(false, "Connection Error");
        showToast("Error connecting to Google Sheet: " + error.message, "error");
        renderEmptyState("Connection error. Please check your Web App URL in settings.");
    }
}

// Calculate Stats and Update Counters
function updateStats(items) {
    statTotalProducts.textContent = items.length;
    
    const totalQty = items.reduce((sum, item) => sum + (parseInt(item.Quantity) || 0), 0);
    statTotalStock.textContent = totalQty;

    const lowStockCount = items.filter(item => (parseInt(item.Quantity) || 0) < 10).length;
    statLowStock.textContent = lowStockCount;
}

// Filter and Render
function applyFiltersAndRender() {
    const searchVal = searchInput.value.toLowerCase();
    
    let filtered = inventoryData.filter(item => {
        const matchesSearch = 
            (item["Product Name"] && item["Product Name"].toString().toLowerCase().includes(searchVal)) ||
            (item["Catalogue Number"] && item["Catalogue Number"].toString().toLowerCase().includes(searchVal)) ||
            (item["Specs"] && item["Specs"].toString().toLowerCase().includes(searchVal)) ||
            (item["Condition"] && item["Condition"].toString().toLowerCase().includes(searchVal));
        
        if (currentFilter === 'low') {
            return matchesSearch && (parseInt(item.Quantity) || 0) < 10;
        }
        return matchesSearch;
    });

    // Apply Sorting
    if (sortColumn) {
        filtered.sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];

            if (sortColumn === 'Quantity') {
                valA = parseInt(valA) || 0;
                valB = parseInt(valB) || 0;
            } else {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    updateStats(inventoryData);
    renderTable(filtered);
}

// Render Loading Spinner
function renderLoadingState() {
    inventoryTbody.innerHTML = `
        <tr>
            <td colspan="7" class="loading-state">
                <i class="fa-solid fa-spinner fa-spin"></i> Refreshing inventory records...
            </td>
        </tr>
    `;
}

// Render Empty/Error State
function renderEmptyState(message) {
    inventoryTbody.innerHTML = `
        <tr>
            <td colspan="7" class="empty-state">
                <i class="fa-solid fa-circle-question" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.5rem; display: block;"></i>
                ${message}
            </td>
        </tr>
    `;
}

// Render Table Data
function renderTable(items) {
    if (items.length === 0) {
        renderEmptyState("No items found matches your filters.");
        return;
    }

    inventoryTbody.innerHTML = '';
    items.forEach(item => {
        const rawQty = item.Quantity !== undefined && item.Quantity !== null ? item.Quantity : '0';
        const qtyNum = parseInt(rawQty) || 0;
        const isLow = qtyNum < 10;
        
        // Define Condition pill
        const conditionVal = item["Condition"] || '';
        let conditionBadge = '';
        if (conditionVal) {
            const condLower = conditionVal.toLowerCase();
            if (condLower.includes('new') || condLower.includes('pack')) {
                conditionBadge = `<span class="badge badge-condition-new">${escapeHtml(conditionVal)}</span>`;
            } else if (condLower.includes('used') || condLower.includes('open')) {
                conditionBadge = `<span class="badge badge-condition-used">${escapeHtml(conditionVal)}</span>`;
            } else {
                conditionBadge = `<span class="badge badge-packing">${escapeHtml(conditionVal)}</span>`;
            }
        }
        
        // Clickable Product Row
        const tr = document.createElement('tr');
        tr.className = 'main-row';
        tr.id = `product-row-${item.row_index}`;
        tr.innerHTML = `
            <td><small style="color: var(--text-muted); font-weight: 600;">${escapeHtml(item["No."] || '')}</small></td>
            <td>${escapeHtml(item["Product Name"] || '')}</td>
            <td style="text-align: center;">
                <div class="quantity-control">
                    <button class="qty-btn dec-btn" data-row="${item.row_index}" data-raw-qty="${rawQty}"><i class="fa-solid fa-minus"></i></button>
                    <span class="qty-value ${isLow ? 'low-stock' : ''}" data-row="${item.row_index}" style="cursor: pointer;" title="Double-click to type quantity">${escapeHtml(rawQty)}</span>
                    <button class="qty-btn inc-btn" data-row="${item.row_index}" data-raw-qty="${rawQty}"><i class="fa-solid fa-plus"></i></button>
                </div>
            </td>
            <td>${conditionBadge}</td>
            <td><code>${escapeHtml(item["Catalogue Number"] || '')}</code></td>
            <td><small style="color: var(--text-secondary); text-overflow: ellipsis; display: block; max-width: 250px; overflow: hidden; white-space: nowrap;">${escapeHtml(item["Specs"] || '')}</small></td>
            <td style="text-align: center;">
                <div class="action-cell">
                    <button class="btn-icon delete delete-btn" data-row="${item.row_index}" title="Remove Item">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;
        
        // Row Click Listener (Open Detail Modal)
        tr.addEventListener('click', (e) => {
            // Ignore click if clicking interactive cells
            if (e.target.closest('.qty-btn') || e.target.closest('.qty-value') || e.target.closest('.delete-btn') || e.target.closest('input')) {
                return;
            }
            openProductModal(item);
        });

        inventoryTbody.appendChild(tr);
    });

    // Wire up event listeners to controls
    document.querySelectorAll('.dec-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newQty = adjustQuantityString(btn.dataset.rawQty, -1);
            updateQuantity(btn.dataset.row, newQty);
        });
    });
    document.querySelectorAll('.inc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newQty = adjustQuantityString(btn.dataset.rawQty, 1);
            updateQuantity(btn.dataset.row, newQty);
        });
    });
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteItem(btn.dataset.row);
        });
    });

    // Inline Editing
    document.querySelectorAll('.qty-value').forEach(span => {
        span.addEventListener('dblclick', () => {
            const rowIndex = span.dataset.row;
            const currentQty = span.textContent;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentQty;
            input.className = 'qty-input-field';
            
            span.replaceWith(input);
            input.focus();
            
            const saveInlineEdit = () => {
                const newQty = input.value.trim();
                if (newQty !== '') {
                    updateQuantity(rowIndex, newQty);
                } else {
                    applyFiltersAndRender();
                }
            };
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') saveInlineEdit();
                if (e.key === 'Escape') applyFiltersAndRender();
            });
            input.addEventListener('blur', saveInlineEdit);
        });
    });
}

// Adjust quantity string while keeping suffix (e.g. "47 Pcs" -> "48 Pcs")
function adjustQuantityString(qtyStr, delta) {
    if (qtyStr === undefined || qtyStr === null) return delta.toString();
    const str = qtyStr.toString().trim();
    const numMatch = str.match(/^(\d+)(.*)$/);
    if (numMatch) {
        const num = parseInt(numMatch[1]) || 0;
        const suffix = numMatch[2] || '';
        const newNum = Math.max(0, num + delta);
        return newNum + suffix;
    }
    const num = parseInt(str) || 0;
    return Math.max(0, num + delta).toString();
}

// Update Quantity API
async function updateQuantity(rowIndex, newQty) {
    // Optimistic UI Update (speedy feedback)
    const rowObj = inventoryData.find(item => item.row_index == rowIndex);
    if (rowObj) {
        rowObj.Quantity = newQty;
        applyFiltersAndRender();
    }

    try {
        await fetch(googleScriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: "update",
                row_index: rowIndex,
                quantity: newQty
            })
        });
        showToast("Stock level updated", "success");
    } catch (err) {
        console.error(err);
        showToast("Error updating database. Reloading...", "error");
        fetchInventory(); // revert to spreadsheet state
    }
}

// Delete Item API
async function deleteItem(rowIndex) {
    if (!confirm("Are you sure you want to delete this product from the inventory database?")) return;

    renderLoadingState();

    try {
        await fetch(googleScriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: "delete",
                row_index: rowIndex
            })
        });
        showToast("Product deleted successfully!", "success");
        setTimeout(fetchInventory, 1000);
    } catch (err) {
        console.error(err);
        showToast("Failed to delete product.", "error");
        fetchInventory();
    }
}

// Excel Drag and Drop Mapping logic
function setupDragAndDrop() {
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) handleExcelFile(files[0]);
    });

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleExcelFile(e.target.files[0]);
    });

    cancelImportBtn.addEventListener('click', () => {
        importPreviewSection.classList.add('hidden');
        dropZone.classList.remove('hidden');
        fileInput.value = '';
        currentExcelData = null;
    });

    confirmImportBtn.addEventListener('click', executeBulkImport);
}

// Read Excel file
function handleExcelFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Grab first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert to array of objects
        currentExcelData = XLSX.utils.sheet_to_json(sheet);
        
        if (!currentExcelData || currentExcelData.length === 0) {
            showToast("Excel file is empty or invalid.", "error");
            return;
        }

        // Get available header keys from first record
        const headers = Object.keys(currentExcelData[0]);
        populateMappingSelectors(headers);

        // Update UI
        dropZone.classList.add('hidden');
        importPreviewSection.classList.remove('hidden');
        importCountBadge.textContent = currentExcelData.length;
        showToast("Excel file parsed! Map columns to import.", "success");
    };
    reader.readAsArrayBuffer(file);
}

// Fill Mapping dropdown selectors
function populateMappingSelectors(headers) {
    const selectors = [mapNameSelect, mapQuantitySelect, mapConditionSelect, mapCatalogueSelect, mapImageSelect, mapMfgSelect, mapArrivalSelect, mapSpecsSelect];
    
    selectors.forEach(sel => {
        sel.innerHTML = '<option value="">-- Skip Column --</option>';
        headers.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            sel.appendChild(opt);
        });
    });

    // Auto-match helpers (intelligent defaults based on matching text)
    autoSelectMap(mapNameSelect, headers, ['name', 'product', 'item', 'title']);
    autoSelectMap(mapQuantitySelect, headers, ['qty', 'quantity', 'stock', 'count', 'amount']);
    autoSelectMap(mapConditionSelect, headers, ['condition', 'status', 'state']);
    autoSelectMap(mapCatalogueSelect, headers, ['catalogue', 'catalog', 'sku', 'number', 'code']);
    autoSelectMap(mapImageSelect, headers, ['image', 'url', 'photo', 'drawing', 'pic', 'picture']);
    autoSelectMap(mapMfgSelect, headers, ['mfg', 'manufacture', 'manufacturing']);
    autoSelectMap(mapArrivalSelect, headers, ['arrival', 'added', 'received', 'date']);
    autoSelectMap(mapSpecsSelect, headers, ['specs', 'specification', 'desc', 'description', 'detail']);
}

function autoSelectMap(selectEl, headers, keywords) {
    const matched = headers.find(h => {
        const lower = h.toLowerCase();
        return keywords.some(k => lower.includes(k));
    });
    if (matched) selectEl.value = matched;
}

// Bulk Import Execution
async function executeBulkImport() {
    if (!googleScriptUrl) {
        showToast("No Google Sheet API connection found.", "error");
        return;
    }

    const nameKey = mapNameSelect.value;
    const qtyKey = mapQuantitySelect.value;
    const conditionKey = mapConditionSelect.value;
    const catKey = mapCatalogueSelect.value;
    const imageKey = mapImageSelect.value;
    const mfgKey = mapMfgSelect.value;
    const arrivalKey = mapArrivalSelect.value;
    const specsKey = mapSpecsSelect.value;

    if (!nameKey) {
        showToast("Product Name column is required to import.", "error");
        return;
    }

    confirmImportBtn.disabled = true;
    confirmImportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Bulk Importing...';

    // Map excel format to system API format
    const mappedItems = currentExcelData.map(row => {
        return {
            "Product Name": row[nameKey] || '',
            "Quantity": qtyKey ? (row[qtyKey] || '0').toString() : '0',
            "Condition": conditionKey ? (row[conditionKey] || '') : '',
            "Catalogue Number": catKey ? (row[catKey] || '') : '',
            "Image URL": imageKey ? (row[imageKey] || '') : '',
            "Mfg Date": mfgKey ? (row[mfgKey] || '') : '',
            "Arrival Date": arrivalKey ? (row[arrivalKey] || '') : '',
            "Specs": specsKey ? (row[specsKey] || '') : ''
        };
    }).filter(item => item["Product Name"] !== ''); // Filter out empty product rows

    try {
        await fetch(googleScriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: "bulk_import",
                items: mappedItems
            })
        });

        showToast(`Successfully imported ${mappedItems.length} items to database!`, "success");
        
        // Reset import UI state
        importPreviewSection.classList.add('hidden');
        dropZone.classList.remove('hidden');
        fileInput.value = '';
        currentExcelData = null;

        // Switch and Refresh
        document.querySelector('[data-tab="dashboard-tab"]').click();
        setTimeout(fetchInventory, 2000);

    } catch (err) {
        console.error(err);
        showToast("Import failed. Please verify sheet access.", "error");
    } finally {
        confirmImportBtn.disabled = false;
        confirmImportBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Import';
    }
}

// Helper to escape HTML tags to prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Export filtered inventory to CSV format
function exportToCSV() {
    if (inventoryData.length === 0) {
        showToast("No data available to export.", "warning");
        return;
    }

    const searchVal = searchInput.value.toLowerCase();
    let filtered = inventoryData.filter(item => {
        const matchesSearch = 
            (item["Product Name"] && item["Product Name"].toString().toLowerCase().includes(searchVal)) ||
            (item["Catalogue Number"] && item["Catalogue Number"].toString().toLowerCase().includes(searchVal)) ||
            (item["Specs"] && item["Specs"].toString().toLowerCase().includes(searchVal)) ||
            (item["Condition"] && item["Condition"].toString().toLowerCase().includes(searchVal));
        
        if (currentFilter === 'low') {
            return matchesSearch && (parseInt(item.Quantity) || 0) < 10;
        }
        return matchesSearch;
    });

    if (filtered.length === 0) {
        showToast("Filtered view is empty.", "warning");
        return;
    }

    // Generate CSV Content
    const headers = ["No.", "Product Name", "Quantity", "Condition", "Catalogue Number", "Specs"];
    const csvRows = [headers.join(",")];

    filtered.forEach(item => {
        const row = [
            `"${(item["No."] || '').toString().replace(/"/g, '""')}"`,
            `"${(item["Product Name"] || '').toString().replace(/"/g, '""')}"`,
            `"${(item["Quantity"] || '0').toString().replace(/"/g, '""')}"`,
            `"${(item["Condition"] || '').toString().replace(/"/g, '""')}"`,
            `"${(item["Catalogue Number"] || '').toString().replace(/"/g, '""')}"`,
            `"${(item["Specs"] || '').toString().replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(","));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    
    // Download link
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ACX_Instruments_Inventory_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Export successful!", "success");
}

// ========================================================
// Product Details Modal Controllers
// ========================================================
const detailModal = document.getElementById('detail-modal');
const closeDetailModalBtn = document.getElementById('close-detail-modal-btn');
const modalProductName = document.getElementById('modal-product-name');
const modalProductImage = document.getElementById('modal-product-image');
const modalCatNumber = document.getElementById('modal-cat-number');
const modalMfgDate = document.getElementById('modal-mfg-date');
const modalArrivalDate = document.getElementById('modal-arrival-date');
const modalSpecsText = document.getElementById('modal-specs-text');
const modalDispatchTbody = document.getElementById('modal-dispatch-tbody');
const dispatchForm = document.getElementById('dispatch-form');
const dispatchSubmitBtn = document.getElementById('dispatch-submit-btn');

// Modal Tabs
const modalTabBtns = document.querySelectorAll('.modal-tab-btn');
const modalTabContents = document.querySelectorAll('.modal-tab-content');

// Helper to format dates cleanly
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr; // Return raw string if invalid
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
        return dateStr;
    }
}

// Open Modal and Populate Data
function openProductModal(item) {
    activeProduct = item;
    
    // Set text details
    modalProductName.textContent = item["Product Name"] || 'Unnamed Product';
    modalCatNumber.textContent = item["Catalogue Number"] || 'N/A';
    modalMfgDate.textContent = formatDate(item["Mfg Date"]);
    modalArrivalDate.textContent = formatDate(item["Arrival Date"]);
    modalSpecsText.textContent = item["Specs"] || 'No specifications provided for this product.';
    
    // Set Product Image (loads fallback if empty)
    const imageUrl = item["Image URL"] || item["Images"] || '';
    if (imageUrl) {
        modalProductImage.src = imageUrl;
    } else {
        // Safe, clean abstract blueprint drawing SVG placeholder
        modalProductImage.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'><rect width='100%' height='100%' fill='%231a243c'/><circle cx='200' cy='150' r='50' stroke='%2338bdf8' stroke-width='2' fill='none' stroke-dasharray='5,5'/><path d='M100 150 L300 150 M200 50 L200 250' stroke='%2364748b' stroke-width='1'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-family='sans-serif' font-size='14'>NO DRAWING AVAILABLE</text></svg>";
    }
    
    // Populate Dispatch history list
    populateDispatchHistory(item["Catalogue Number"]);
    
    // Reset forms and tabs
    dispatchForm.reset();
    document.getElementById('dispatch-date').value = new Date().toISOString().substring(0, 10);
    modalTabBtns[0].click(); // Activate first tab (Specifications)
    
    // Show Modal
    detailModal.classList.remove('hidden');
}

// Filter and populate dispatches matching the product's Catalogue Number
function populateDispatchHistory(catalogueNumber) {
    modalDispatchTbody.innerHTML = '';
    
    const matchedDispatches = dispatchesData.filter(d => {
        return catalogueNumber && d["Catalogue Number"] && d["Catalogue Number"].toString().trim() === catalogueNumber.toString().trim();
    });
    
    if (matchedDispatches.length === 0) {
        modalDispatchTbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No dispatch history recorded for this item.
                </td>
            </tr>
        `;
        return;
    }
    
    matchedDispatches.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(d["Customer"] || '')}</strong></td>
            <td>${formatDate(d["Dispatch Date"])}</td>
            <td><strong>${escapeHtml(d["Quantity"] || '0')} Pcs</strong></td>
            <td><code>${escapeHtml(d["Tracking Details"] || 'N/A')}</code></td>
        `;
        modalDispatchTbody.appendChild(tr);
    });
}

// Close Modal Event Listener
closeDetailModalBtn.addEventListener('click', () => {
    detailModal.classList.add('hidden');
    activeProduct = null;
});

// Click outside modal to close
detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) {
        detailModal.classList.add('hidden');
        activeProduct = null;
    }
});

// Modal Tabs Navigation Toggle
modalTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modalTabBtns.forEach(b => b.classList.remove('active'));
        modalTabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const contentId = btn.getAttribute('data-modal-tab');
        document.getElementById(contentId).classList.add('active');
    });
});

// Handle Log Shipment / Dispatch Form Submit
dispatchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!googleScriptUrl) {
        showToast("No connection to Google Sheets.", "error");
        return;
    }
    if (!activeProduct) return;
    
    const customer = document.getElementById('dispatch-customer').value.trim();
    const qty = document.getElementById('dispatch-qty').value.trim();
    const date = document.getElementById('dispatch-date').value;
    const tracking = document.getElementById('dispatch-tracking').value.trim();
    
    // Check local stock limits
    const currentQtyNum = parseInt(activeProduct.Quantity) || 0;
    const dispatchQtyNum = parseInt(qty) || 0;
    
    if (dispatchQtyNum > currentQtyNum) {
        showToast("Error: Shipped quantity exceeds current warehouse stock!", "error");
        return;
    }
    
    dispatchSubmitBtn.disabled = true;
    dispatchSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Shipment...';
    
    try {
        await fetch(googleScriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'dispatch',
                catalogue_number: activeProduct["Catalogue Number"] || '',
                customer: customer,
                dispatch_date: date,
                tracking_details: tracking,
                quantity: qty.toString()
            })
        });
        
        showToast("Shipment logged successfully! Stock adjusted.", "success");
        detailModal.classList.add('hidden');
        activeProduct = null;
        
        // Refresh local data
        setTimeout(fetchInventory, 1500);
    } catch (error) {
        showToast("Failed to record shipment. Try again.", "error");
    } finally {
        dispatchSubmitBtn.disabled = false;
        dispatchSubmitBtn.innerHTML = '<i class="fa-solid fa-truck"></i> Ship & Subtract Stock';
    }
});
