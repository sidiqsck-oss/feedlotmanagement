/* ============================================
   APP.JS — SPA Router, Init, Global Events
   ============================================ */
(async function () {
    'use strict';

    // --- Initialize DB ---
    await DB.open();

    // --- Initialize Auth ---
    const savedUser = await Auth.init();

    // --- Show login or main page ---
    if (savedUser) {
        showMainApp(savedUser);
    } else {
        showLogin();
    }

    // --- Login ---
    document.getElementById('btnLogin').addEventListener('click', handleLogin);
    document.getElementById('loginPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    async function handleLogin() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        if (!username) return;

        const result = await Auth.login(username, password);
        if (result.success) {
            showMainApp(result.user);
        } else {
            const errEl = document.getElementById('loginError');
            errEl.textContent = result.message;
            errEl.style.display = 'block';
            setTimeout(() => errEl.style.display = 'none', 3000);
        }
    }

    // --- Logout ---
    document.getElementById('btnLogout').addEventListener('click', () => {
        Auth.logout();
        showLogin();
    });

    // --- Show Login ---
    function showLogin() {
        document.getElementById('pageLogin').style.display = 'flex';
        document.getElementById('pageMain').classList.add('hidden');
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginError').style.display = 'none';
    }

    // --- Show Main App ---
    async function showMainApp(user) {
        document.getElementById('pageLogin').style.display = 'none';
        document.getElementById('pageMain').classList.remove('hidden');
        document.getElementById('headerUser').textContent = `👤 ${user.username} (${user.role})`;

        // Filter navigation tabs based on permissions
        const tabs = {
            tabInduksi: 'induksi',
            tabReweight: 'reweight',
            tabPenjualan: 'penjualan',
            tabSettings: 'settings'
        };
        Object.entries(tabs).forEach(([tabId, perm]) => {
            const tab = document.getElementById(tabId);
            if (tab) {
                tab.style.display = Auth.hasPermission(perm) ? '' : 'none';
            }
        });

        // Initialize modules
        await Induksi.init();
        await Reweight.init();
        await Penjualan.init();
        await SupabaseSync.initUI();
        await loadLogs();
        await Induksi.refreshSummaryFilter();

        // Navigate to first visible tab
        const firstVisibleTab = document.querySelector('.nav-tab:not([style*="display: none"])');
        if (firstVisibleTab) navigateTo(firstVisibleTab.dataset.page);
    }

    // --- Navigation ---
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => navigateTo(tab.dataset.page));
    });

    function navigateTo(pageId) {
        // Hide all pages
        document.querySelectorAll('.page-section').forEach(page => page.classList.remove('active'));
        // Show target
        const target = document.getElementById(pageId);
        if (target) target.classList.add('active');
        // Update nav tab active state
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.page === pageId);
        });
    }

    // --- Weight Display (update from scale events) ---
    window.addEventListener('scale-data', (e) => {
        const display = document.getElementById('weightValue');
        if (display) {
            display.textContent = e.detail.weight.toFixed(1);
        }
    });

    // --- Master Data "+" Buttons ---
    let currentMasterType = '';
    let currentMasterTargetSelect = '';

    document.querySelectorAll('.btn-add-master').forEach(btn => {
        btn.addEventListener('click', () => {
            currentMasterType = btn.dataset.type;
            const typeLabels = {
                shipment: 'Shipment',
                frame: 'Frame',
                kodeProperty: 'Kode Property',
                jenisSapi: 'Jenis Sapi',
                pembeli: 'Pembeli'
            };
            document.getElementById('modalAddMasterTitle').textContent = `Tambah ${typeLabels[currentMasterType] || 'Data'}`;
            document.getElementById('modalAddMasterLabel').textContent = typeLabels[currentMasterType] || 'Nama';
            document.getElementById('modalAddMasterInput').value = '';
            Utils.openModal('modalAddMaster');
            document.getElementById('modalAddMasterInput').focus();
        });
    });

    document.getElementById('btnModalAddMasterSave').addEventListener('click', async () => {
        const value = document.getElementById('modalAddMasterInput').value.trim();
        if (!value) { Utils.showToast('Nilai tidak boleh kosong', 'warning'); return; }
        await DB.addMaster(currentMasterType, value);
        Utils.closeModal('modalAddMaster');
        Utils.showToast('Data berhasil ditambahkan', 'success');
        // Refresh relevant dropdowns
        await Induksi.loadDropdowns();
        await Penjualan.loadDropdowns();
    });

    // Enter key in master modal
    document.getElementById('modalAddMasterInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btnModalAddMasterSave').click();
    });

    // --- Modal Close Buttons ---
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => Utils.closeModal(btn.dataset.close));
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });

    // --- Settings: Serial ---
    document.getElementById('btnConnectScanner').addEventListener('click', () => {
        SerialManager.toggleScanner();
        updateSerialButtons();
    });
    document.getElementById('btnConnectScale').addEventListener('click', () => {
        SerialManager.toggleScale();
        updateSerialButtons();
    });

    function updateSerialButtons() {
        setTimeout(() => {
            const btnScanner = document.getElementById('btnConnectScanner');
            const btnScale = document.getElementById('btnConnectScale');
            btnScanner.textContent = SerialManager.isScannerConnected() ? 'Disconnect' : 'Connect';
            btnScanner.className = SerialManager.isScannerConnected() ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';
            btnScale.textContent = SerialManager.isScaleConnected() ? 'Disconnect' : 'Connect';
            btnScale.className = SerialManager.isScaleConnected() ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';
        }, 500);
    }

    // --- Settings: Backup ---
    document.getElementById('btnBackupExport').addEventListener('click', () => Backup.exportAll());
    document.getElementById('btnBackupImport').addEventListener('click', () => document.getElementById('backupImportFile').click());
    document.getElementById('backupImportFile').addEventListener('change', (e) => {
        if (e.target.files[0]) Backup.importAll(e.target.files[0]);
        e.target.value = '';
    });

    // --- Settings: Sync ---
    document.getElementById('btnSyncUpload').addEventListener('click', () => SupabaseSync.upload());
    document.getElementById('btnSyncDownload').addEventListener('click', () => SupabaseSync.download());
    document.getElementById('btnSyncConfig').addEventListener('click', async () => {
        const urlSetting = await DB.get('settings', 'supabaseUrl');
        const keySetting = await DB.get('settings', 'supabaseKey');
        document.getElementById('configSupabaseUrl').value = urlSetting ? urlSetting.value : '';
        document.getElementById('configSupabaseKey').value = keySetting ? keySetting.value : '';
        Utils.openModal('modalSupabaseConfig');
    });
    document.getElementById('btnSaveSupabaseConfig').addEventListener('click', async () => {
        const url = document.getElementById('configSupabaseUrl').value.trim();
        const key = document.getElementById('configSupabaseKey').value.trim();
        if (!url || !key) { Utils.showToast('URL dan Key harus diisi', 'warning'); return; }
        await SupabaseSync.saveConfig(url, key);
        Utils.closeModal('modalSupabaseConfig');
        Utils.showToast('Konfigurasi Supabase berhasil disimpan', 'success');
        SupabaseSync.initUI();
    });

    // --- Settings: User Management ---
    document.getElementById('btnManageUsers').addEventListener('click', async () => {
        if (!Auth.isAdmin()) { Utils.showToast('Hanya admin yang bisa mengelola user', 'warning'); return; }
        await refreshUserTable();
        Utils.openModal('modalUserManagement');
    });

    document.getElementById('btnAddUser').addEventListener('click', async () => {
        const username = document.getElementById('newUserUsername').value.trim();
        const password = document.getElementById('newUserPassword').value;
        const role = document.getElementById('newUserRole').value;
        if (!username || !password) { Utils.showToast('Username dan Password harus diisi', 'warning'); return; }
        const permissions = {
            induksi: document.getElementById('newUserAccInduksi').checked,
            reweight: document.getElementById('newUserAccReweight').checked,
            penjualan: document.getElementById('newUserAccPenjualan').checked,
            settings: document.getElementById('newUserAccSettings').checked
        };
        const result = await Auth.addUser(username, password, role, permissions);
        if (result.success) {
            Utils.showToast('User berhasil ditambahkan', 'success');
            document.getElementById('newUserUsername').value = '';
            document.getElementById('newUserPassword').value = '';
            await refreshUserTable();
        } else {
            Utils.showToast(result.message, 'error');
        }
    });

    async function refreshUserTable() {
        const users = await Auth.getAllUsers();
        const tbody = document.getElementById('userTableBody');
        tbody.innerHTML = '';
        users.forEach(user => {
            const perms = user.permissions || {};
            const permBadges = Object.entries(perms)
                .filter(([, v]) => v)
                .map(([k]) => `<span class="permission-badge">${k}</span>`)
                .join(' ');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.username}</td>
                <td>${user.role}</td>
                <td><div class="user-permissions">${permBadges || '-'}</div></td>
                <td>
                    ${user.username !== 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteUserHandler('${user.username}')">🗑️ Hapus</button>` : '<span class="text-muted">default</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Global handler for delete user button
    window.deleteUserHandler = async function (username) {
        if (!confirm(`Hapus user "${username}"?`)) return;
        const result = await Auth.deleteUser(username);
        if (result.success) {
            Utils.showToast('User berhasil dihapus', 'success');
            await refreshUserTable();
        } else {
            Utils.showToast(result.message, 'error');
        }
    };

    // --- LOG ---
    async function loadLogs() {
        const logs = await DB.getAll('sync_log');
        const tbody = document.getElementById('logTableBody');
        tbody.innerHTML = '';
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Belum ada log</td></tr>';
            return;
        }
        // Show most recent first
        logs.reverse().forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${Utils.formatDate(log.timestamp)} ${new Date(log.timestamp).toLocaleTimeString('id-ID')}</td>
                <td>${log.action}</td>
                <td>${log.detail}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/feedlotmanagement/service-worker.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.warn('SW registration failed:', err));
    }

    // --- Web Serial API check ---
    if (!SerialManager.isSupported()) {
        console.warn('Web Serial API not supported in this browser');
    }

})();
