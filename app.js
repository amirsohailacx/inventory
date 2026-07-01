// App State
let inventoryData = [];
let dispatchesData = []; // Store customer dispatches history
let activeProduct = null; // Track current product in details modal
let googleScriptUrl = localStorage.getItem('google_inventory_api_url') || 'https://script.google.com/macros/s/AKfycbwPwW6IFEkMV4ORdUgyhxta67aijDYncvub_CEDjyn8eVPvxcfL2D0YdBmsphK2RERV/exec';
let currentFilter = 'all';
let currentExcelData = null; // Stored parsed excel sheets
let sortColumn = null;
let sortDirection = 'asc'; // 'asc' or 'desc'

// Employee State
const defaultEmployees = ["Jiahao Li", "Yacine Belgaid", "Amir Sohail"];
let employees = JSON.parse(localStorage.getItem('inventory_employees_v2')) || defaultEmployees;
if (!localStorage.getItem('inventory_employees_v2')) {
    localStorage.setItem('inventory_employees_v2', JSON.stringify(employees));
}

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

// Charts Instances
let stockChartInstance = null;
let conditionChartInstance = null;

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
    try {
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            const msgBuffer = new TextEncoder().encode(message);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        }
    } catch (e) {
        console.warn("Crypto API failed, using fallback:", e);
    }
    return sha256Fallback(message);
}

// Pure JS SHA-256 Fallback for HTTP Contexts
function sha256Fallback(ascii) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let i, j;
    let result = '';
    const words = [];
    const asciiLength = ascii.length;
    const hash = [];
    const k = [];
    let primeCounter = 0;
    const getPrime = function(candidate) {
        for (let i = 2; i * i <= candidate; i++) {
            if (candidate % i === 0) return;
        }
        return candidate;
    };
    let candidate = 2;
    while (primeCounter < 64) {
        const p = getPrime(candidate++);
        if (p) {
            if (primeCounter < 8) {
                hash[primeCounter] = (mathPow(p, 1/2) * maxWord) | 0;
            }
            k[primeCounter++] = (mathPow(p, 1/3) * maxWord) | 0;
        }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
        const charCode = ascii.charCodeAt(i);
        if (charCode >> 8) return; 
        words[i >> 2] |= charCode << ((3 - i % 4) * 8);
    }
    words[words.length] = ((asciiLength * 8) / maxWord) | 0;
    words[words.length] = (asciiLength * 8) | 0;
    for (j = 0; j < words.length; j += 16) {
        const w = words.slice(j, j + 16);
        const oldHash = hash.slice(0);
        for (i = 0; i < 64; i++) {
            let wItem = w[i];
            if (i >= 16) {
                const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                wItem = w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }
            const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
            const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
            const sigma0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
            const sigma1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
            const temp1 = (hash[7] + sigma1 + ch + k[i] + wItem) | 0;
            const temp2 = (sigma0 + maj) | 0;
            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
            hash.length = 8;
        }
        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }
    for (i = 0; i < 8; i++) {
        const value = hash[i];
        for (j = 3; j >= 0; j--) {
            const byteVal = (value >> (j * 8)) & 0xff;
            result += (byteVal < 16 ? '0' : '') + byteVal.toString(16);
        }
    }
    return result;
}

function unlockDashboard() {
    document.getElementById('login-gate').classList.add('hidden');
    document.getElementById('app-wrapper').classList.remove('hidden');
    
    // Populate employee selectors and settings list
    populateEmployeeDropdowns();
    renderSettingsEmployees();
    
    // Fetch latest data if URL is configured
    if (googleScriptUrl) {
        fetchInventory();
    }
}

// Initialize App
function initApp() {
    console.log("ACX Instruments App loaded: v10 (Safety Updates)");
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
            try {
                const passwordInput = document.getElementById('login-password');
                const hashedInput = await sha256(passwordInput.value);
                const targetHash = localStorage.getItem('dashboard_password_hash') || CORRECT_PASSWORD_HASH;
                
                if (hashedInput === targetHash) {
                    sessionStorage.setItem('authenticated', 'true');
                    loginError.classList.add('hidden');
                    unlockDashboard();
                } else {
                    loginError.classList.remove('hidden');
                    loginError.textContent = "❌ Incorrect password. Please try again.";
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            } catch (err) {
                console.error("Login submission error:", err);
                loginError.classList.remove('hidden');
                loginError.textContent = "❌ Cache Error: Please hold Shift and click the reload button to refresh your browser cache.";
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
        if (inventoryData && inventoryData.length > 0) {
            renderCharts(inventoryData);
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
            
            // Render specific views on switch
            if (contentId === 'dispatches-log-tab') {
                renderDispatchesTable();
            } else if (contentId === 'dashboard-tab') {
                applyFiltersAndRender();
            } else if (contentId === 'activity-log-tab') {
                renderActivityLog();
            }
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

    // Dispatches Search & Export Events
    const dispatchSearchInput = document.getElementById('dispatch-search-input');
    const exportDispatchesBtn = document.getElementById('export-dispatches-btn');
    if (dispatchSearchInput) dispatchSearchInput.addEventListener('input', renderDispatchesTable);
    if (exportDispatchesBtn) exportDispatchesBtn.addEventListener('click', exportDispatchesToCSV);

    // Activity Search Listener
    const activitySearchInput = document.getElementById('activity-search-input');
    if (activitySearchInput) activitySearchInput.addEventListener('input', renderActivityLog);

    // Search and Filter Events
    searchInput.addEventListener('input', applyFiltersAndRender);
    
    // Add select dropdown filter listeners
    const filterConditionEl = document.getElementById('filter-condition');
    const filterStockEl = document.getElementById('filter-stock');
    if (filterConditionEl) filterConditionEl.addEventListener('change', applyFiltersAndRender);
    if (filterStockEl) filterStockEl.addEventListener('change', applyFiltersAndRender);

    // Stats Cards Click Events to filter
    const cardTotalProducts = document.getElementById('card-total-products');
    const cardTotalStock = document.getElementById('card-total-stock');
    const cardLowStock = document.getElementById('card-low-stock');

    if (cardTotalProducts) {
        cardTotalProducts.addEventListener('click', () => {
            searchInput.value = '';
            if (filterConditionEl) filterConditionEl.value = 'all';
            if (filterStockEl) filterStockEl.value = 'all';
            applyFiltersAndRender();
            showToast("Showing all products", "info");
        });
    }

    if (cardTotalStock) {
        cardTotalStock.addEventListener('click', () => {
            searchInput.value = '';
            if (filterConditionEl) filterConditionEl.value = 'all';
            if (filterStockEl) filterStockEl.value = 'all';
            applyFiltersAndRender();
            showToast("Showing all products", "info");
        });
    }

    if (cardLowStock) {
        cardLowStock.addEventListener('click', () => {
            searchInput.value = '';
            if (filterConditionEl) filterConditionEl.value = 'all';
            if (filterStockEl) filterStockEl.value = 'low_stock';
            applyFiltersAndRender();
            showToast("Filtering to show: Low Stock items", "info");
        });
    }

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

        const employee = document.getElementById('new-employee').value;
        const name = document.getElementById('new-product-name').value.trim();
        const quantity = document.getElementById('new-quantity').value.trim();
        const condition = document.getElementById('new-condition').value.trim();
        const catalogue = document.getElementById('new-catalogue-number').value.trim();
        const imageUrl = document.getElementById('new-image-url').value.trim();
        const mfgDate = document.getElementById('new-mfg-date').value;
        const arrivalDate = document.getElementById('new-arrival-date').value;
        const specs = document.getElementById('new-specs').value.trim();

        if (!employee) {
            showToast("Error: An authorised employee must be selected!", "error");
            return;
        }

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
            logActivity("Update", `Product **${name}** (Qty: **${quantity}**) was added by employee **${employee}**.`);
            addProductForm.reset();
            if (newProductImagePreview) {
                newProductImagePreview.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiB2aWV3Qm94PSIwIDAgNDAwIDMwMCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFhMjQzYyIvPjxjaXJjbGUgY3g9IjIwMCIgY3k9IjE1MCIgcj0iNTAiIHN0cm9rZT0iIzM4YmRmOCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtZGFzaGFycmF5PSI1LDUiLz48cGF0aCBkPSJNMTAwIDE1MCBMMzAwIDE1MCBNMjAwIDUwIEwyMDAgMjUwIiBzdHJva2U9IiM2NDc0OGIiIHN0cm9rZS13aWR0aD0iMSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjQ3NDhiIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCI+Q0xJQ0sgVE8gVVBMT0FEPC90ZXh0Pjwvc3ZnPg==";
            }
            
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

    // Manage Employees Add Event in Settings
    const addEmployeeBtn = document.getElementById('settings-add-employee-btn');
    const newEmployeeInput = document.getElementById('settings-new-employee-name');
    if (addEmployeeBtn && newEmployeeInput) {
        addEmployeeBtn.addEventListener('click', () => {
            const name = newEmployeeInput.value.trim();
            if (!name) {
                showToast("Please enter an employee name.", "warning");
                return;
            }
            if (employees.includes(name)) {
                showToast("Employee already exists.", "warning");
                return;
            }
            employees.push(name);
            localStorage.setItem('inventory_employees_v2', JSON.stringify(employees));
            newEmployeeInput.value = '';
            renderSettingsEmployees();
            populateEmployeeDropdowns();
            showToast(`Employee "${name}" registered successfully!`, "success");
        });
    }

    // Excel Drag and Drop Setup
    setupDragAndDrop();
}

// Safely execute initApp regardless of script loading timing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

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
            checkDeepLink();
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

    const lowStockCount = items.filter(item => {
        const qty = parseInt(item.Quantity) || 0;
        const threshold = parseInt(localStorage.getItem('threshold_' + item["Product Name"])) || 5;
        return qty < threshold && qty > 0;
    }).length;
    statLowStock.textContent = lowStockCount;
}

// Filter and Render
function applyFiltersAndRender() {
    const searchVal = searchInput.value.toLowerCase();
    
    const filterConditionEl = document.getElementById('filter-condition');
    const filterStockEl = document.getElementById('filter-stock');
    
    const conditionVal = filterConditionEl ? filterConditionEl.value : 'all';
    const stockVal = filterStockEl ? filterStockEl.value : 'all';
    
    let filtered = inventoryData.filter(item => {
        const matchesSearch = 
            (item["Product Name"] && item["Product Name"].toString().toLowerCase().includes(searchVal)) ||
            (item["Catalogue Number"] && item["Catalogue Number"].toString().toLowerCase().includes(searchVal)) ||
            (item["Specs"] && item["Specs"].toString().toLowerCase().includes(searchVal)) ||
            (item["Condition"] && item["Condition"].toString().toLowerCase().includes(searchVal));
            
        let matchesCondition = false;
        if (conditionVal === 'all') {
            matchesCondition = true;
        } else {
            const itemCond = (item["Condition"] || '').toString().trim().toLowerCase();
            const filterCond = conditionVal.toLowerCase();
            if (filterCond === 'new') {
                matchesCondition = itemCond.includes('new') || itemCond.includes('pack');
            } else if (filterCond === 'used') {
                matchesCondition = itemCond.includes('used') || itemCond.includes('open');
            } else if (filterCond === 'refurbished') {
                matchesCondition = itemCond.includes('refurb') || itemCond.includes('renew');
            } else {
                matchesCondition = itemCond === filterCond;
            }
        }
        
        let matchesStock = true;
        const qty = parseInt(item.Quantity) || 0;
        const threshold = parseInt(localStorage.getItem('threshold_' + item["Product Name"])) || 5;
        if (stockVal === 'in_stock') {
            matchesStock = qty >= threshold;
        } else if (stockVal === 'low_stock') {
            matchesStock = qty < threshold && qty > 0;
        } else if (stockVal === 'out_of_stock') {
            matchesStock = qty === 0;
        }
        
        return matchesSearch && matchesCondition && matchesStock;
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
    renderCharts(inventoryData);
}

// Render Chart.js Analytics
function renderCharts(items) {
    const isDark = !document.body.classList.contains('light-theme');
    const textColor = isDark ? '#ffffff' : '#000000'; // Bold shining black for light, white for dark
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)';

    // --- CHART 1: Stock Distribution ---
    const stockCanvas = document.getElementById('stock-dist-chart');
    if (stockCanvas) {
        if (stockChartInstance) stockChartInstance.destroy();
        
        // Take top 8 items to avoid overcrowding
        const sortedItems = [...items].sort((a, b) => (parseInt(b.Quantity) || 0) - (parseInt(a.Quantity) || 0)).slice(0, 8);
        const labels = sortedItems.map(item => {
            const name = item["Product Name"] || 'N/A';
            return name.length > 15 ? name.substring(0, 15) + '...' : name;
        });
        const data = sortedItems.map(item => parseInt(item.Quantity) || 0);

        // Beautiful distinct colors for each product bar
        const barColors = [
            'rgba(2, 132, 199, 0.85)',   // Blue
            'rgba(139, 92, 246, 0.85)',  // Violet
            'rgba(16, 185, 129, 0.85)',  // Emerald
            'rgba(244, 63, 94, 0.85)',   // Rose
            'rgba(245, 158, 11, 0.85)',  // Amber
            'rgba(6, 182, 212, 0.85)',   // Cyan
            'rgba(236, 72, 153, 0.85)',  // Pink
            'rgba(99, 102, 241, 0.85)'   // Indigo
        ];
        const borderColors = [
            '#0284c7', '#8b5cf6', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4', '#ec4899', '#6366f1'
        ];

        stockChartInstance = new Chart(stockCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Stock Quantity',
                    data: data,
                    backgroundColor: barColors.slice(0, data.length),
                    borderColor: borderColors.slice(0, data.length),
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const clickedItem = sortedItems[index];
                        if (clickedItem) {
                            openProductModal(clickedItem);
                        }
                    }
                },
                onHover: (event, chartElement) => {
                    event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { boxPadding: 5 }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 10, weight: '700' } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 10, weight: '700' } }
                    }
                }
            }
        });
    }

    // --- CHART 2: Condition Ratio ---
    const conditionCanvas = document.getElementById('condition-ratio-chart');
    if (conditionCanvas) {
        if (conditionChartInstance) conditionChartInstance.destroy();

        // Tally conditions case-insensitively with robust matching
        const tallies = { 'New': 0, 'Used': 0, 'Refurbished': 0 };
        items.forEach(item => {
            const cond = (item["Condition"] || '').toString().trim().toLowerCase();
            if (cond.includes('new') || cond.includes('pack')) {
                tallies['New']++;
            } else if (cond.includes('used') || cond.includes('open')) {
                tallies['Used']++;
            } else if (cond.includes('refurb') || cond.includes('renew')) {
                tallies['Refurbished']++;
            } else if (cond !== '') {
                // Fallback to New if non-empty but doesn't match standard keywords
                tallies['New']++;
            }
        });

        // Sum of all values
        const totalItemsCount = tallies['New'] + tallies['Used'] + tallies['Refurbished'];

        // Custom plugin to draw sum in the center of the doughnut
        const centerTextPlugin = {
            id: 'centerText',
            beforeDraw: function(chart) {
                const width = chart.width;
                const height = chart.height;
                const ctx = chart.ctx;
                ctx.restore();
                
                const chartArea = chart.chartArea;
                const centerX = (chartArea.left + chartArea.right) / 2;
                const centerY = (chartArea.top + chartArea.bottom) / 2;
                
                ctx.font = "bold 1.6rem 'Plus Jakarta Sans', sans-serif";
                ctx.textBaseline = "middle";
                ctx.textAlign = "center";
                ctx.fillStyle = isDark ? '#ffffff' : '#000000';
                
                ctx.fillText(totalItemsCount, centerX, centerY - 10);
                
                ctx.font = "700 0.72rem 'Plus Jakarta Sans', sans-serif";
                ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
                ctx.fillText("Total Items", centerX, centerY + 12);
                ctx.save();
            }
        };

        conditionChartInstance = new Chart(conditionCanvas, {
            type: 'doughnut',
            data: {
                labels: ['New', 'Used', 'Refurbished'],
                datasets: [{
                    data: [tallies['New'], tallies['Used'], tallies['Refurbished']],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.85)', // Green
                        'rgba(245, 158, 11, 0.85)', // Amber
                        'rgba(139, 92, 246, 0.85)'  // Violet
                    ],
                    borderColor: isDark ? '#1e293b' : '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const labels = ['New', 'Used', 'Refurbished'];
                        const clickedCondition = labels[index];
                        
                        // Defer to avoid destroying the chart inside its own event loop
                        setTimeout(() => {
                            const conditionFilterEl = document.getElementById('filter-condition');
                            if (conditionFilterEl) {
                                conditionFilterEl.value = clickedCondition;
                                applyFiltersAndRender();
                                showToast(`Filtering to show: ${clickedCondition} items`, "info");
                                
                                // Smooth scroll down to table view
                                const tableContainer = document.querySelector('.table-container');
                                if (tableContainer) {
                                    tableContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                }
                            }
                        }, 50);
                    }
                },
                onHover: (event, chartElement) => {
                    event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            font: { family: 'Plus Jakarta Sans', size: 11, weight: '700' },
                            padding: 15
                        }
                    },
                    tooltip: { boxPadding: 5 }
                }
            },
            plugins: [centerTextPlugin]
        });
    }
}

// Render Loading Spinner
function renderLoadingState() {
    inventoryTbody.innerHTML = `
        <tr>
            <td colspan="8" class="loading-state">
                <i class="fa-solid fa-spinner fa-spin"></i> Refreshing inventory records...
            </td>
        </tr>
    `;
}

// Render Empty/Error State
function renderEmptyState(message) {
    inventoryTbody.innerHTML = `
        <tr>
            <td colspan="8" class="empty-state">
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

        // Define Quantity Badge with custom colors based on levels
        let qtyBadge = '';
        if (qtyNum === 0) {
            qtyBadge = `<span class="badge" style="background-color: rgba(239, 68, 68, 0.12); color: var(--danger); font-weight: 700; border: 1px solid rgba(239, 68, 68, 0.2); padding: 0.35rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.82rem; display: inline-block; min-width: 55px; text-align: center;">0 Pcs</span>`;
        } else if (qtyNum < 5) {
            qtyBadge = `<span class="badge" style="background-color: rgba(245, 158, 11, 0.12); color: var(--warning); font-weight: 700; border: 1px solid rgba(245, 158, 11, 0.2); padding: 0.35rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.82rem; display: inline-block; min-width: 55px; text-align: center;">${escapeHtml(rawQty)}</span>`;
        } else {
            qtyBadge = `<span class="badge" style="background-color: rgba(16, 185, 129, 0.12); color: var(--success); font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.2); padding: 0.35rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.82rem; display: inline-block; min-width: 55px; text-align: center;">${escapeHtml(rawQty)}</span>`;
        }
        
        // Clickable Product Row
        const tr = document.createElement('tr');
        tr.className = 'main-row';
        tr.id = `product-row-${item.row_index}`;
        tr.innerHTML = `
            <td style="text-align: center; padding: 0.75rem 1rem;"><input type="checkbox" class="row-checkbox" data-row="${item.row_index}"></td>
            <td><small style="color: var(--text-muted); font-weight: 600;">${escapeHtml(item["No."] || '')}</small></td>
            <td style="font-weight: 600; color: var(--text-primary);">${escapeHtml(item["Product Name"] || '')}</td>
            <td style="text-align: center;">${qtyBadge}</td>
            <td>${conditionBadge}</td>
            <td><code style="background-color: rgba(2, 132, 199, 0.08); color: var(--primary); border: 1px solid rgba(2, 132, 199, 0.15); padding: 0.25rem 0.5rem; border-radius: var(--radius-xs); font-family: monospace; font-weight: 600; font-size: 0.85rem;">${escapeHtml(item["Catalogue Number"] || '')}</code></td>
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
            if (e.target.closest('.delete-btn') || e.target.closest('input')) {
                return;
            }
            openProductModal(item);
        });

        inventoryTbody.appendChild(tr);
    });

    // Wire up delete listener
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteItem(btn.dataset.row);
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
        logActivity("Import", `Bulk imported **${mappedItems.length} items** from Excel sheet.`);
        
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

// Print single QR tag
function printSingleTag(item) {
    const printContainer = document.getElementById('print-slip-container');
    if (!printContainer || typeof QRCode === 'undefined') return;
    
    const canvas = document.createElement('canvas');
    const qrLink = window.location.origin + window.location.pathname + '?cat=' + encodeURIComponent((item["Catalogue Number"] || item["Product Name"] || '').toString().trim());
    
    QRCode.toCanvas(canvas, qrLink, { width: 140, margin: 1 }, () => {
        const qrImgUrl = canvas.toDataURL();
        printContainer.innerHTML = `
            <div class="print-slip-doc" style="max-width: 250px; margin: 50px auto; text-align: center; border: 2px solid #000; padding: 1.5rem; border-radius: 8px; font-family: 'Inter', sans-serif;">
                <h2 style="font-size: 0.95rem; margin: 0 0 0.5rem 0; font-weight: 800; letter-spacing: -0.3px;">ACX INSTRUMENTS</h2>
                <img src="${qrImgUrl}" style="width: 120px; height: 120px; margin: 0.5rem 0;" />
                <div style="font-size: 0.8rem; font-weight: 700; margin-top: 0.5rem; line-height: 1.3;">${item["Product Name"]}</div>
                <div style="font-size: 0.75rem; color: #555; margin-top: 0.25rem;">Cat: ${item["Catalogue Number"] || 'N/A'}</div>
                <div style="font-size: 0.85rem; font-weight: 800; margin-top: 0.5rem; border-top: 1px solid #ddd; padding-top: 0.5rem;">Qty: ${item["Quantity"]}</div>
            </div>
        `;
        window.print();
    });
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
    
    // Set custom threshold field
    const threshold = parseInt(localStorage.getItem('threshold_' + item["Product Name"])) || 5;
    const thresholdInput = document.getElementById('modal-threshold-input');
    if (thresholdInput) thresholdInput.value = threshold;

    // Calculate burn rate and days stock remaining
    const matchedDispatches = dispatchesData.filter(d => {
        return item["Catalogue Number"] && d["Catalogue Number"] && d["Catalogue Number"].toString().trim() === item["Catalogue Number"].toString().trim();
    });
    
    let dailyBurnRate = 0;
    let daysRemaining = 'N/A';
    
    if (matchedDispatches.length > 0) {
        let totalDispatched = 0;
        let minDate = new Date();
        
        matchedDispatches.forEach(d => {
            const qty = parseInt(d["Quantity"]) || 0;
            totalDispatched += qty;
            const dDate = new Date(d["Dispatch Date"]);
            if (!isNaN(dDate.getTime()) && dDate < minDate) {
                minDate = dDate;
            }
        });
        
        const timeDiff = Math.abs(new Date().getTime() - minDate.getTime());
        const daysDiff = Math.max(1, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
        
        dailyBurnRate = (totalDispatched / daysDiff);
        
        const currentQty = parseInt(item["Quantity"]) || 0;
        if (dailyBurnRate > 0) {
            daysRemaining = Math.max(0, Math.ceil(currentQty / dailyBurnRate));
        }
    }
    
    const burnRateEl = document.getElementById('modal-burn-rate');
    const daysRemainingEl = document.getElementById('modal-days-remaining');
    if (burnRateEl) burnRateEl.textContent = dailyBurnRate > 0 ? `${dailyBurnRate.toFixed(2)} units/day` : '0 units/day';
    if (daysRemainingEl) {
        if (daysRemaining === 'N/A') {
            daysRemainingEl.textContent = 'No dispatches yet';
            daysRemainingEl.style.color = 'var(--text-secondary)';
        } else {
            daysRemainingEl.textContent = `${daysRemaining} days`;
            if (daysRemaining <= 5) {
                daysRemainingEl.style.color = 'var(--danger)';
            } else if (daysRemaining <= 15) {
                daysRemainingEl.style.color = 'var(--warning)';
            } else {
                daysRemainingEl.style.color = 'var(--success)';
            }
        }
    }

    // Render QR Code Tag
    const qrCanvas = document.getElementById('modal-qr-canvas');
    if (qrCanvas && typeof QRCode !== 'undefined') {
        const qrLink = window.location.origin + window.location.pathname + '?cat=' + encodeURIComponent((item["Catalogue Number"] || item["Product Name"] || '').toString().trim());
        QRCode.toCanvas(qrCanvas, qrLink, {
            width: 110,
            margin: 1,
            color: {
                dark: '#0f172a',
                light: '#ffffff'
            }
        }, function (error) {
            if (error) console.error("QR Code Error:", error);
        });
    }

    // Save Alert Threshold event
    const thresholdSaveBtn = document.getElementById('modal-threshold-save-btn');
    if (thresholdSaveBtn) {
        thresholdSaveBtn.onclick = () => {
            const val = parseInt(document.getElementById('modal-threshold-input').value) || 5;
            localStorage.setItem('threshold_' + item["Product Name"], val);
            showToast("Custom alert threshold saved!", "success");
            applyFiltersAndRender();
            updateStats(inventoryData);
        };
    }

    // Print Tag event
    const printTagBtn = document.getElementById('modal-print-tag-btn');
    if (printTagBtn) {
        printTagBtn.onclick = () => {
            printSingleTag(item);
        };
    }

    // Set Product Image (loads fallback if empty or invalid URL)
    let imageUrl = (item["Image URL"] || item["Images"] || '').toString().trim();
    
    // Auto-convert Google Drive sharing links to direct image source URLs
    if (imageUrl.includes('drive.google.com')) {
        const driveMatch = imageUrl.match(/\bhttps:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=)([^/]+)/);
        if (driveMatch) {
            const fileId = driveMatch[1].split(/[?&]/)[0];
            imageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
        }
    }

    if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('data:image/'))) {
        modalProductImage.src = imageUrl;
    } else {
        modalProductImage.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiB2aWV3Qm94PSIwIDAgNDAwIDMwMCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFhMjQzYyIvPjxjaXJjbGUgY3g9IjIwMCIgY3k9IjE1MCIgcj0iNTAiIHN0cm9rZT0iIzM4YmRmOCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtZGFzaGFycmF5PSI1LDUiLz48cGF0aCBkPSJNMTAwIDE1MCBMMzAwIDE1MCBNMjAwIDUwIEwyMDAgMjUwIiBzdHJva2U9IiM2NDc0OGIiIHN0cm9rZS13aWR0aD0iMSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjQ3NDhiIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCI+Tk8gRFJBV0lORyBBVkFJTEFCTEU8L3RleHQ+PC9zdmc+";
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
    
    const employee = document.getElementById('dispatch-employee').value;
    const customer = document.getElementById('dispatch-customer').value.trim();
    const qty = document.getElementById('dispatch-qty').value.trim();
    const date = document.getElementById('dispatch-date').value;
    const tracking = document.getElementById('dispatch-tracking').value.trim();
    
    if (!employee) {
        showToast("Error: An authorised employee must be selected!", "error");
        return;
    }

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
                quantity: qty.toString(),
                employee: employee
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

// ========================================================
// User Profile Dropdown & Password Management
// ========================================================
const userProfileBtn = document.getElementById('user-profile-btn');
const profileDropdown = document.getElementById('profile-dropdown');
const sheetDropdownLink = document.getElementById('sheet-dropdown-link');
const changePasswordDropdownBtn = document.getElementById('change-password-dropdown-btn');
const logoutDropdownBtn = document.getElementById('logout-dropdown-btn');

// Change Password Modal DOM Elements
const changePasswordModal = document.getElementById('change-password-modal');
const closeChangePassModalBtn = document.getElementById('close-change-pass-modal-btn');
const changePasswordForm = document.getElementById('change-password-form');
const changePassSubmitBtn = document.getElementById('change-pass-submit-btn');

// Toggle Profile Dropdown Menu
if (userProfileBtn && profileDropdown) {
    userProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('hidden');
    });

    // Click anywhere else to close profile dropdown
    document.addEventListener('click', () => {
        profileDropdown.classList.add('hidden');
    });
}

// Sheet Dropdown Link Setup
if (googleScriptUrl && sheetDropdownLink) {
    // Attempt to extract the spreadsheet view URL from Web App URL or link to docs
    const sheetIdMatch = googleScriptUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (sheetIdMatch) {
        sheetDropdownLink.href = `https://docs.google.com/spreadsheets/d/${sheetIdMatch[1]}`;
    } else {
        // Fallback: search sheets
        sheetDropdownLink.href = "https://docs.google.com/spreadsheets";
    }
}

// Sign Out Handler
if (logoutDropdownBtn) {
    logoutDropdownBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (confirm("Are you sure you want to log out from the ACX Instruments dashboard?")) {
            sessionStorage.removeItem('authenticated');
            showToast("Logged out successfully.", "success");
            // Reload page to show login gate
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    });
}

// Change Password Modal Trigger
if (changePasswordDropdownBtn && changePasswordModal && changePasswordForm) {
    changePasswordDropdownBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        profileDropdown.classList.add('hidden');
        changePasswordForm.reset();
        changePasswordModal.classList.remove('hidden');
    });
}

// Close Change Password Modal
if (closeChangePassModalBtn && changePasswordModal) {
    closeChangePassModalBtn.addEventListener('click', () => {
        changePasswordModal.classList.add('hidden');
    });
}

// Click outside change password modal card to close
if (changePasswordModal) {
    changePasswordModal.addEventListener('click', (e) => {
        if (e.target === changePasswordModal) {
            changePasswordModal.classList.add('hidden');
        }
    });
}

// Change Password Submission Form Handler
if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const newVal = document.getElementById('new-pass-val').value;
        const confirmVal = document.getElementById('new-pass-confirm').value;
        
        if (newVal !== confirmVal) {
            showToast("Passwords do not match! Please verify.", "error");
            return;
        }
        
        changePassSubmitBtn.disabled = true;
        changePassSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Password...';
        
        try {
            // Compute SHA-256 hash of new password and save to browser storage
            const newHash = await sha256(newVal);
            localStorage.setItem('dashboard_password_hash', newHash);
            
            showToast("Password updated successfully on this browser!", "success");
            changePasswordModal.classList.add('hidden');
        } catch (err) {
            showToast("Failed to change password.", "error");
        } finally {
            changePassSubmitBtn.disabled = false;
            changePassSubmitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Update Password';
        }
    });
}

// ========================================================
// Change Profile Avatar Controllers
// ========================================================
const changeAvatarDropdownBtn = document.getElementById('change-avatar-dropdown-btn');
const changeAvatarModal = document.getElementById('change-avatar-modal');
const closeAvatarModalBtn = document.getElementById('close-avatar-modal-btn');
const changeAvatarForm = document.getElementById('change-avatar-form');
const avatarSubmitBtn = document.getElementById('avatar-submit-btn');

function updateProfileAvatar() {
    const avatarContainer = document.getElementById('profile-avatar-container');
    if (!avatarContainer) return;
    
    const savedAvatar = localStorage.getItem('profile_avatar_url');
    if (savedAvatar) {
        avatarContainer.innerHTML = `<img src="${escapeHtml(savedAvatar)}" alt="Profile Logo">`;
    } else {
        avatarContainer.innerHTML = `<i class="fa-solid fa-user"></i>`;
    }
}

// Update avatar on script execution startup
updateProfileAvatar();

// Open Change Avatar Modal
if (changeAvatarDropdownBtn && changeAvatarModal && changeAvatarForm) {
    changeAvatarDropdownBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        profileDropdown.classList.add('hidden');
        changeAvatarForm.reset();
        changeAvatarModal.classList.remove('hidden');
    });
}

// Close Avatar Modal
if (closeAvatarModalBtn && changeAvatarModal) {
    closeAvatarModalBtn.addEventListener('click', () => {
        changeAvatarModal.classList.add('hidden');
    });
}

// Click outside avatar modal card to close
if (changeAvatarModal) {
    changeAvatarModal.addEventListener('click', (e) => {
        if (e.target === changeAvatarModal) {
            changeAvatarModal.classList.add('hidden');
        }
    });
}

// Form Submission Event & File Uploader (Profile Avatar)
const avatarUploadDropzone = document.getElementById('avatar-upload-dropzone');
const avatarFileInput = document.getElementById('avatar-file-input');

if (avatarUploadDropzone && avatarFileInput) {
    // Click dropzone to select local file
    avatarUploadDropzone.addEventListener('click', () => avatarFileInput.click());
    
    // Stop propagation so clicking the input doesn't trigger parent dropzone click again (avoids loop)
    avatarFileInput.addEventListener('click', (e) => e.stopPropagation());
    
    avatarFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleAvatarFileUpload(e.target.files[0]);
    });

    // Drag-and-drop events on avatar dropzone
    ['dragenter', 'dragover'].forEach(name => {
        avatarUploadDropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            avatarUploadDropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        avatarUploadDropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            avatarUploadDropzone.classList.remove('dragover');
        });
    });

    avatarUploadDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        avatarUploadDropzone.classList.remove('dragover');
        const dt = e.dataTransfer;
        if (dt.files.length) {
            handleAvatarFileUpload(dt.files[0]);
        }
    });
}

function handleAvatarFileUpload(file) {
    if (!file.type.startsWith('image/')) {
        showToast("Error: File must be an image.", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Proportional resize to 120x120 (prevent stretching/squishing)
            const canvas = document.createElement('canvas');
            const maxDim = 120;
            canvas.width = maxDim;
            canvas.height = maxDim;
            const ctx = canvas.getContext('2d');
            
            // Clear canvas to transparent background
            ctx.clearRect(0, 0, maxDim, maxDim);
            
            // Calculate proportional dimensions to fit inside 120x120
            let width = img.width;
            let height = img.height;
            let dx = 0;
            let dy = 0;
            
            if (width > height) {
                const ratio = maxDim / width;
                width = maxDim;
                height = height * ratio;
                dy = (maxDim - height) / 2; // Center vertically
            } else {
                const ratio = maxDim / height;
                height = maxDim;
                width = width * ratio;
                dx = (maxDim - width) / 2; // Center horizontally
            }
            
            ctx.drawImage(img, dx, dy, width, height);

            // Export to PNG to preserve transparency (prevent black background)
            const compressedBase64 = canvas.toDataURL('image/png');
            localStorage.setItem('profile_avatar_url', compressedBase64);
            updateProfileAvatar();
            showToast("Profile avatar updated successfully!", "success");
            changeAvatarModal.classList.add('hidden');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

if (changeAvatarForm) {
    changeAvatarForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const url = document.getElementById('new-avatar-url').value.trim();
        if (url) {
            localStorage.setItem('profile_avatar_url', url);
            updateProfileAvatar();
            showToast("Profile avatar updated successfully!", "success");
            changeAvatarModal.classList.add('hidden');
        } else {
            showToast("Please select a file to upload or paste a URL link.", "warning");
        }
    });
}

// ========================================================
// Drag-and-Drop Image Uploader & Compressor (Add Product Form)
// ========================================================
const newProductImageDropzone = document.getElementById('new-product-image-dropzone');
const newProductImageInput = document.getElementById('new-product-image-input');
const newProductImagePreview = document.getElementById('new-product-image-preview');
const newImageUrlInput = document.getElementById('new-image-url');

if (newProductImageDropzone && newProductImageInput) {
    newProductImageDropzone.addEventListener('click', () => newProductImageInput.click());
    newProductImageInput.addEventListener('click', (e) => e.stopPropagation());
    
    newProductImageInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleNewProductImageUpload(e.target.files[0]);
    });

    ['dragenter', 'dragover'].forEach(name => {
        newProductImageDropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            newProductImageDropzone.style.borderColor = 'var(--primary)';
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        newProductImageDropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            newProductImageDropzone.style.borderColor = 'var(--border-color)';
        });
    });

    newProductImageDropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt.files.length) {
            handleNewProductImageUpload(dt.files[0]);
        } else {
            const url = dt.getData('text/plain');
            if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/'))) {
                newProductImagePreview.src = url;
                newImageUrlInput.value = url;
            }
        }
    });
}

function handleNewProductImageUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
        showToast("Please select a valid image file.", "warning");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            const maxDimension = 600;
            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
            newProductImagePreview.src = compressedBase64;
            newImageUrlInput.value = compressedBase64;
            showToast("Product image uploaded successfully!", "success");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ========================================================
// Drag-and-Drop Image Uploader & Compressor (Details Modal)
// ========================================================
const modalImageDropzone = document.getElementById('modal-image-dropzone');
const modalImageInput = document.getElementById('modal-image-input');

if (modalImageDropzone && modalImageInput) {
    // Click to select file
    modalImageDropzone.addEventListener('click', () => modalImageInput.click());
    
    // Stop propagation so clicking the input doesn't trigger parent click loops
    modalImageInput.addEventListener('click', (e) => e.stopPropagation());
    
    modalImageInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleImageUpload(e.target.files[0]);
    });

    // Drag events
    ['dragenter', 'dragover'].forEach(name => {
        modalImageDropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            modalImageDropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        modalImageDropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            modalImageDropzone.classList.remove('dragover');
        });
    });

    modalImageDropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        
        // Scenario 1: User dragged an image file from their computer
        if (dt.files.length) {
            handleImageUpload(dt.files[0]);
        } 
        // Scenario 2: User dragged an image URL / link from Google Images
        else {
            const url = dt.getData('text/plain');
            if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/'))) {
                saveProductImageUrl(url.trim());
            }
        }
    });
}

// Helper to compress the image and upload to Google Sheets
function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
        showToast("Error: File must be an image.", "error");
        return;
    }
    if (!activeProduct) return;

    showToast("Processing image...", "info");
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // HTML5 Canvas compression to resize image to max 400px (tiny base64 string size!)
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 400;
            const MAX_HEIGHT = 400;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG with 0.75 quality
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
            saveProductImageUrl(compressedBase64);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Post the image link or Base64 string to Apps Script
async function saveProductImageUrl(imageData) {
    if (!googleScriptUrl) {
        showToast("No database connection.", "error");
        return;
    }
    if (!activeProduct) return;

    const rowIndex = activeProduct.row_index;
    showToast("Saving image to database...", "info");

    try {
        await fetch(googleScriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_image',
                row_index: rowIndex.toString(),
                image_data: imageData
            })
        });

        // Update local views
        modalProductImage.src = imageData;
        activeProduct["Image URL"] = imageData;
        activeProduct["Images"] = imageData;
        
        // Sync cache
        const localItem = inventoryData.find(item => item.row_index == rowIndex);
        if (localItem) {
            localItem["Image URL"] = imageData;
            localItem["Images"] = imageData;
        }

        showToast("Image saved successfully!", "success");
    } catch (err) {
        showToast("Failed to save image.", "error");
    }
}

// ========================================================
// Dispatches Tab Render & Export Operations
// ========================================================
function renderDispatchesTable() {
    const tbody = document.getElementById('dispatches-tbody');
    const totalCountEl = document.getElementById('stat-total-dispatches');
    const searchInputEl = document.getElementById('dispatch-search-input');
    const searchVal = searchInputEl ? searchInputEl.value.toLowerCase() : '';
    
    if (!tbody) return;
    
    // Sort dispatches descending (newest first)
    const logs = [...dispatchesData].reverse();
    
    const filteredLogs = logs.filter(log => {
        return (
            (log["Catalogue Number"] && log["Catalogue Number"].toString().toLowerCase().includes(searchVal)) ||
            (log["Customer"] && log["Customer"].toString().toLowerCase().includes(searchVal)) ||
            (log["Dispatch Date"] && log["Dispatch Date"].toString().toLowerCase().includes(searchVal)) ||
            (log["Tracking Details"] && log["Tracking Details"].toString().toLowerCase().includes(searchVal))
        );
    });
    
    if (totalCountEl) totalCountEl.textContent = filteredLogs.length;
    
    if (filteredLogs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <i class="fa-solid fa-circle-question" style="font-size: 1.5rem; color: var(--text-muted); margin-bottom: 0.5rem; display: block;"></i>
                    No shipment logs found matching search criteria.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filteredLogs.map(log => `
        <tr>
            <td><strong>${escapeHtml(log["Catalogue Number"] || 'N/A')}</strong></td>
            <td>${escapeHtml(log["Customer"] || 'N/A')}</td>
            <td><i class="fa-regular fa-calendar-days" style="color: var(--text-muted); margin-right: 0.25rem;"></i> ${escapeHtml(log["Dispatch Date"] || 'N/A')}</td>
            <td><span class="badge blue" style="background-color: var(--primary-light); color: var(--primary); font-weight: 500;">${escapeHtml(log["Tracking Details"] || 'None')}</span></td>
            <td><span style="font-weight: 600; color: var(--text-primary); white-space: nowrap;">${escapeHtml(log["Quantity"] || '0')} pcs</span></td>
            <td><span style="font-weight: 500; color: var(--text-secondary);"><i class="fa-solid fa-user" style="margin-right: 0.25rem; font-size: 0.8rem; color: var(--primary);"></i> ${escapeHtml(log["Employee"] || log["Authorised By"] || log["Authorized By"] || 'System')}</span></td>
        </tr>
    `).join('');
}

function exportDispatchesToCSV() {
    if (dispatchesData.length === 0) {
        showToast("No shipment logs to export.", "warning");
        return;
    }
    
    const headers = ["Catalogue Number", "Customer", "Dispatch Date", "Tracking Details", "Quantity"];
    const csvRows = [headers.join(",")];
    
    dispatchesData.forEach(log => {
        const values = headers.map(header => {
            const val = (log[header] || "").toString().replace(/"/g, '""');
            return `"${val}"`;
        });
        csvRows.push(values.join(","));
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `dispatches_log_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Shipment logs exported to CSV successfully!", "success");
}

// ========================================================
// Bulk Inventory Selection & Operations
// ========================================================
function updateBulkBar() {
    const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
    const bulkBar = document.getElementById('bulk-actions-bar');
    const countEl = document.getElementById('bulk-select-count');
    
    if (!bulkBar) return;
    
    if (checkedBoxes.length > 0) {
        if (countEl) countEl.textContent = `${checkedBoxes.length} item${checkedBoxes.length > 1 ? 's' : ''} selected`;
        bulkBar.classList.remove('hidden');
    } else {
        bulkBar.classList.add('hidden');
    }
}

// Bind Select-All Checkbox change in DOM
function initBulkOperations() {
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    const bulkUpdateConditionBtn = document.getElementById('bulk-update-condition-btn');
    const bulkPrintSlipBtn = document.getElementById('bulk-print-slip-btn');
    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    const bulkClearSelectionBtn = document.getElementById('bulk-clear-selection-btn');

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', () => {
            const rowCheckboxes = document.querySelectorAll('.row-checkbox');
            rowCheckboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
            updateBulkBar();
        });
    }

    if (bulkClearSelectionBtn) {
        bulkClearSelectionBtn.addEventListener('click', () => {
            const rowCheckboxes = document.querySelectorAll('.row-checkbox');
            rowCheckboxes.forEach(cb => cb.checked = false);
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
            updateBulkBar();
        });
    }
    if (bulkPrintSlipBtn) {
        bulkPrintSlipBtn.addEventListener('click', () => {
            const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
            if (checkedBoxes.length === 0) return;
            
            const selectedItems = [];
            checkedBoxes.forEach(cb => {
                const rowIndex = parseInt(cb.dataset.row);
                const item = inventoryData.find(i => parseInt(i.row_index) === rowIndex);
                if (item) selectedItems.push(item);
            });
            
            if (selectedItems.length > 0) {
                generateAndPrintPackingSlip(selectedItems);
            }
        });
    }

    if (bulkUpdateConditionBtn) {
        bulkUpdateConditionBtn.addEventListener('click', async () => {
            const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
            if (checkedBoxes.length === 0) return;
            
            const newCondition = prompt("Enter new condition for selected items (New, Used, Refurbished):");
            if (!newCondition) return;
            
            bulkUpdateConditionBtn.disabled = true;
            bulkUpdateConditionBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
            showToast(`Updating condition for ${checkedBoxes.length} items...`, "info");
            
            let successCount = 0;
            for (let cb of checkedBoxes) {
                const rowIndex = cb.dataset.row;
                try {
                    await fetch(googleScriptUrl, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'update_field',
                            row_index: rowIndex,
                            column: 4, // Column D (Condition)
                            value: newCondition
                        })
                    });
                    successCount++;
                } catch (e) {
                    console.error("Bulk condition update failed for row " + rowIndex, e);
                }
            }
            
            showToast(`Successfully updated condition for ${successCount} items!`, "success");
            logActivity("Update", `Updated condition to **${newCondition}** for **${successCount} items**.`);
            bulkUpdateConditionBtn.disabled = false;
            bulkUpdateConditionBtn.innerHTML = '<i class="fa-solid fa-circle-info"></i> Set Condition';
            
            // Clear selection & Refresh
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
            checkedBoxes.forEach(cb => cb.checked = false);
            updateBulkBar();
            setTimeout(fetchInventory, 1000);
        });
    }

    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', async () => {
            const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
            if (checkedBoxes.length === 0) return;
            
            if (!confirm(`Are you sure you want to permanently delete these ${checkedBoxes.length} items from the Google Sheet?`)) {
                return;
            }
            
            bulkDeleteBtn.disabled = true;
            bulkDeleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
            showToast(`Deleting ${checkedBoxes.length} items from database...`, "info");
            
            // Delete descending order of rows to avoid row index shifting issues!
            const rowIndices = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.row)).sort((a, b) => b - a);
            
            let successCount = 0;
            for (let rowIndex of rowIndices) {
                try {
                    await fetch(googleScriptUrl, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'delete',
                            row_index: rowIndex
                        })
                    });
                    successCount++;
                } catch (e) {
                    console.error("Bulk delete failed for row " + rowIndex, e);
                }
            }
            
            showToast(`Deleted ${successCount} items from database!`, "success");
            logActivity("Delete", `Bulk deleted **${successCount} items** from database.`);
            bulkDeleteBtn.disabled = false;
            bulkDeleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete';
            
            // Clear selection & Refresh
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
            checkedBoxes.forEach(cb => cb.checked = false);
            updateBulkBar();
            setTimeout(fetchInventory, 1000);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBulkOperations);
} else {
    initBulkOperations();
}

// Generate printable Packing Slip document and trigger window.print
function generateAndPrintPackingSlip(items) {
    const printContainer = document.getElementById('print-slip-container');
    if (!printContainer) return;
    
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const slipNumber = 'SLIP-' + Math.floor(100000 + Math.random() * 900000);
    
    let tableRowsHtml = '';
    items.forEach((item, index) => {
        tableRowsHtml += `
            <tr>
                <td>${index + 1}</td>
                <td style="font-weight: 600;">${item["Product Name"] || 'N/A'}</td>
                <td>${item["Catalogue Number"] || 'N/A'}</td>
                <td><span style="font-family: monospace; font-size: 0.8rem;">${item["Specs"] || 'N/A'}</span></td>
                <td>${item["Condition"] || 'N/A'}</td>
                <td style="font-weight: 700; text-align: center;">${item["Quantity"]}</td>
            </tr>
        `;
    });
    
    printContainer.innerHTML = `
        <div class="print-slip-doc">
            <div class="print-slip-header">
                <div>
                    <h2 style="font-size: 1.45rem; font-weight: 800; margin: 0; letter-spacing: -0.3px; color: #0284c7;">ACX INSTRUMENTS</h2>
                    <p style="font-size: 0.75rem; color: #555; margin: 0.15rem 0 0 0;">Cambridge, United Kingdom | Quality Lab Equipment</p>
                </div>
                <div class="print-slip-title-area">
                    <h1>PACKING SLIP</h1>
                    <p>Ref: <strong>${slipNumber}</strong></p>
                </div>
            </div>
            
            <div class="print-slip-meta-grid">
                <div>
                    <strong>Date Generated:</strong> ${dateStr}<br/>
                    <strong>Carrier:</strong> Internal Logistics / Courier Delivery<br/>
                    <strong>Status:</strong> Ready for Dispatch
                </div>
                <div style="text-align: right;">
                    <strong>Source Location:</strong> ACX Instruments Warehouse<br/>
                    <strong>Audited By:</strong> Warehouse Management Dashboard<br/>
                    <strong>Authorised Signature Required</strong>
                </div>
            </div>
            
            <table class="print-slip-table">
                <thead>
                    <tr>
                        <th style="width: 5%">No.</th>
                        <th style="width: 35%">Item Description</th>
                        <th style="width: 20%">Catalogue No.</th>
                        <th style="width: 25%">Specs / Code</th>
                        <th style="width: 10%">Condition</th>
                        <th style="width: 5%; text-align: center;">Qty</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
            </table>
            
            <div class="print-slip-signatures">
                <div class="sig-line">
                    Authorised Sign-off / Dispatcher
                </div>
                <div class="sig-line">
                    Received By / Consignee
                </div>
            </div>
        </div>
    `;
    
    logActivity("Export", `Generated packing slip for ${items.length} items (${slipNumber}).`);
    window.print();
}

// Activity log local storage audit trail
function logActivity(actionType, details) {
    const logs = JSON.parse(localStorage.getItem('activity_audit_logs')) || [];
    const timestamp = new Date().toISOString();
    logs.unshift({
        timestamp: timestamp,
        type: actionType, // 'Dispatch', 'Import', 'Update', 'Export', 'Delete'
        details: details
    });
    if (logs.length > 150) logs.pop();
    localStorage.setItem('activity_audit_logs', JSON.stringify(logs));
}

// Retrieve combined local & Apps Script dispatches audit trail
function getActivityLogs() {
    const localLogs = JSON.parse(localStorage.getItem('activity_audit_logs')) || [];
    
    const dispatchLogs = dispatchesData.map(d => {
        return {
            timestamp: d["Dispatch Date"] || new Date().toISOString(),
            type: 'Dispatch',
            details: `Shipped **${d["Quantity"] || '0'} units** of Cat: **${d["Catalogue Number"]}** to customer **${d["Customer"] || 'Unknown'}** (Ref: ${d["Tracking Details"] || 'N/A'}).`
        };
    });
    
    const merged = [...localLogs, ...dispatchLogs];
    merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return merged;
}

// Render dynamic timeline items on screen
function renderActivityLog() {
    const timelineEl = document.getElementById('activity-log-timeline');
    const searchInputEl = document.getElementById('activity-search-input');
    if (!timelineEl) return;
    
    const searchVal = searchInputEl ? searchInputEl.value.toLowerCase().trim() : '';
    const logs = getActivityLogs();
    
    const filteredLogs = logs.filter(log => {
        if (!searchVal) return true;
        const detailsLower = (log.details || '').toLowerCase();
        const typeLower = (log.type || '').toLowerCase();
        return detailsLower.includes(searchVal) || typeLower.includes(searchVal);
    });
    
    if (filteredLogs.length === 0) {
        timelineEl.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 3rem;">
                <i class="fa-solid fa-list-check" style="font-size: 2.25rem; margin-bottom: 0.75rem; color: var(--border-color);"></i>
                <p>No activity logs found matching your filters.</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    filteredLogs.forEach(log => {
        let badgeClass = 'info';
        
        if (log.type === 'Dispatch') {
            badgeClass = 'success';
        } else if (log.type === 'Import') {
            badgeClass = 'info';
        } else if (log.type === 'Delete') {
            badgeClass = 'danger';
        } else if (log.type === 'Update') {
            badgeClass = 'warning';
        } else if (log.type === 'Export') {
            badgeClass = 'info';
        }
        
        const dateObj = new Date(log.timestamp);
        const dateStr = isNaN(dateObj.getTime()) ? log.timestamp : dateObj.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let parsedDetails = escapeHtml(log.details || '');
        parsedDetails = parsedDetails.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        html += `
            <div class="timeline-item">
                <div class="timeline-badge ${badgeClass}"></div>
                <div class="timeline-content">
                    <div class="timeline-meta">
                        <span class="type" style="text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">${log.type}</span>
                        <span class="time">${dateStr}</span>
                    </div>
                    <div class="timeline-text">${parsedDetails}</div>
                </div>
            </div>
        `;
    });
    
    timelineEl.innerHTML = html;
}

// Deep-link check for QR code scans
function checkDeepLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const catQuery = urlParams.get('cat');
    if (catQuery && inventoryData.length > 0) {
        const linkedItem = inventoryData.find(i => 
            (i["Catalogue Number"] && i["Catalogue Number"].toString().trim().toLowerCase() === catQuery.trim().toLowerCase()) ||
            (i["Product Name"] && i["Product Name"].toString().trim().toLowerCase() === catQuery.trim().toLowerCase())
        );
        if (linkedItem) {
            openProductModal(linkedItem);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
}

// Populate employee dropdown selectors in modal dispatches & add forms
function populateEmployeeDropdowns() {
    const dispatchSelect = document.getElementById('dispatch-employee');
    const newProductSelect = document.getElementById('new-employee');
    
    if (dispatchSelect) {
        dispatchSelect.innerHTML = '<option value="" disabled selected>Select employee...</option>';
        employees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp;
            opt.textContent = emp;
            dispatchSelect.appendChild(opt);
        });
    }
    
    if (newProductSelect) {
        newProductSelect.innerHTML = '<option value="" disabled selected>Select employee...</option>';
        employees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp;
            opt.textContent = emp;
            newProductSelect.appendChild(opt);
        });
    }
}

// Render company employees management list in settings tab
function renderSettingsEmployees() {
    const listEl = document.getElementById('settings-employees-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    employees.forEach((emp, index) => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justify = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '0.5rem 0.75rem';
        li.style.background = 'var(--bg-hover)';
        li.style.border = '1px solid var(--border-color)';
        li.style.borderRadius = 'var(--radius-sm)';
        li.style.fontSize = '0.85rem';
        
        li.innerHTML = `
            <span style="font-weight: 500; color: var(--text-primary);"><i class="fa-solid fa-id-badge" style="color: var(--primary); margin-right: 0.4rem;"></i> ${emp}</span>
            <button type="button" class="bulk-btn danger" style="padding: 3px 8px; font-size: 0.7rem; margin: 0; line-height: 1.2; border: 1px solid var(--border-color); background: rgba(239, 68, 68, 0.1); color: var(--danger); cursor: pointer;" onclick="removeEmployee(${index})">
                <i class="fa-solid fa-trash-can"></i> Remove
            </button>
        `;
        listEl.appendChild(li);
    });
}

// Global hook for employee deletion
window.removeEmployee = function(index) {
    const name = employees[index];
    employees.splice(index, 1);
    localStorage.setItem('inventory_employees_v2', JSON.stringify(employees));
    renderSettingsEmployees();
    populateEmployeeDropdowns();
    showToast(`Employee "${name}" removed.`, "info");
};
