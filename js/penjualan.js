/* ============================================
   PENJUALAN MODULE — Sales / Invoice
   Multi-item cart per buyer, PDF Invoice, Staff Excel
   ============================================ */
const Penjualan = (() => {
    let cartItems = []; // Temporary sale items before saving
    let printSettings = {
        header: 'Feedlot Management',
        subHeader: '',
        footer: '',
        pageSize: 'a4',
        orientation: 'portrait',
        logoDataUrl: null
    };

    // --- Initialize ---
    async function init() {
        document.getElementById('penjTanggal').value = Utils.todayStr();
        await loadDropdowns();
        await loadPrintSettings();
        bindEvents();
        await refreshHistory();
    }

    async function loadDropdowns() {
        const select = document.getElementById('penjPembeli');
        const current = select.value;
        const items = await DB.getMasterByType('pembeli');
        select.innerHTML = '<option value="">-- Pilih --</option>';
        items.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            select.appendChild(opt);
        });
        if (current) select.value = current;
    }

    // --- Bind events ---
    function bindEvents() {
        document.getElementById('btnPenjualanInput').addEventListener('click', addToCart);
        document.getElementById('btnPenjualanClear').addEventListener('click', clearForm);

        // RFID lookup
        document.getElementById('penjRfid').addEventListener('change', lookupRfid);
        document.getElementById('penjRfid').addEventListener('keydown', (e) => { if (e.key === 'Enter') lookupRfid(); });

        // Export buttons
        document.getElementById('btnPenjExportPdf').addEventListener('click', exportPdf);
        document.getElementById('btnPenjExportStaffExcel').addEventListener('click', exportStaffExcel);

        // History buttons
        document.getElementById('btnPenjHistoryExportPdf').addEventListener('click', exportHistoryPdf);
        document.getElementById('btnPenjHistoryExportStaff').addEventListener('click', exportHistoryStaffExcel);
        document.getElementById('btnPenjHistoryDelete').addEventListener('click', deleteSelectedHistory);
        document.getElementById('penjHistoryFilter').addEventListener('change', refreshHistory);
        document.getElementById('penjHistCheckAll').addEventListener('change', (e) => {
            document.querySelectorAll('.penj-hist-check').forEach(cb => cb.checked = e.target.checked);
        });

        // Print settings
        document.getElementById('btnPenjPrintSettings').addEventListener('click', () => {
            document.getElementById('printHeader').value = printSettings.header;
            document.getElementById('printSubHeader').value = printSettings.subHeader;
            document.getElementById('printFooter').value = printSettings.footer;
            document.getElementById('printPageSize').value = printSettings.pageSize;
            document.getElementById('printOrientation').value = printSettings.orientation;
            Utils.openModal('modalPrintSettings');
        });
        document.getElementById('btnSavePrintSettings').addEventListener('click', savePrintSettings);
        document.getElementById('printLogoFile').addEventListener('change', handleLogoUpload);

        // Scanner auto-fill
        window.addEventListener('scanner-data', (e) => {
            const activePage = document.querySelector('.page-section.active');
            if (activePage && activePage.id === 'pagePenjualan') {
                document.getElementById('penjRfid').value = e.detail.rfid;
                lookupRfid();
            }
        });

        // Scale
        window.addEventListener('scale-data', (e) => {
            const activePage = document.querySelector('.page-section.active');
            if (activePage && activePage.id === 'pagePenjualan') {
                document.getElementById('penjBerat').value = e.detail.weight.toFixed(1);
            }
        });
    }

    // --- RFID Lookup ---
    async function lookupRfid() {
        const rfid = document.getElementById('penjRfid').value.trim();
        if (!rfid) return;
        const induksiRecord = await DB.get('induksi', rfid);
        if (!induksiRecord) {
            Utils.showToast('RFID tidak ditemukan di data Induksi', 'warning');
            return;
        }
        document.getElementById('penjEartag').value = induksiRecord.eartag || '';
        document.getElementById('penjShipment').value = induksiRecord.shipment || '';
        Utils.showToast(`Data ditemukan: ${induksiRecord.eartag || rfid}`, 'success');
    }

    // --- Add to Cart ---
    function addToCart() {
        const rfid = document.getElementById('penjRfid').value.trim();
        const pembeli = document.getElementById('penjPembeli').value;
        if (!rfid) { Utils.showToast('RFID tidak boleh kosong', 'warning'); return; }
        if (!pembeli) { Utils.showToast('Pilih Pembeli terlebih dahulu', 'warning'); return; }

        const item = {
            id: Utils.generateId(),
            rfid,
            pembeli,
            tanggalJual: document.getElementById('penjTanggal').value,
            eartag: document.getElementById('penjEartag').value,
            shipment: document.getElementById('penjShipment').value,
            berat: parseFloat(document.getElementById('penjBerat').value) || 0
        };

        cartItems.push(item);
        refreshCartTable();
        // Clear RFID and weight for next scan
        document.getElementById('penjRfid').value = '';
        document.getElementById('penjEartag').value = '';
        document.getElementById('penjShipment').value = '';
        document.getElementById('penjBerat').value = '';
        Utils.showToast('Ditambahkan ke daftar penjualan', 'success');
    }

    // --- Clear form ---
    function clearForm() {
        document.getElementById('penjRfid').value = '';
        document.getElementById('penjEartag').value = '';
        document.getElementById('penjShipment').value = '';
        document.getElementById('penjBerat').value = '';
        document.getElementById('penjTanggal').value = Utils.todayStr();
    }

    // --- Cart Table ---
    function refreshCartTable() {
        const tbody = document.getElementById('penjTableBody');
        tbody.innerHTML = '';
        if (cartItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Belum ada item</td></tr>';
            return;
        }
        cartItems.forEach((item, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${i + 1}</td>
                <td>${item.rfid}</td>
                <td>${item.eartag || '-'}</td>
                <td>${item.shipment || '-'}</td>
                <td>${Utils.formatNumber(item.berat)}</td>
                <td>${Utils.formatDate(item.tanggalJual)}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="Penjualan.editCartItem('${item.id}')">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="Penjualan.removeCartItem('${item.id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function removeCartItem(id) {
        cartItems = cartItems.filter(item => item.id !== id);
        refreshCartTable();
        Utils.showToast('Item dihapus dari daftar', 'info');
    }

    function editCartItem(id) {
        const item = cartItems.find(i => i.id === id);
        if (!item) return;
        // Put data back into form for editing
        document.getElementById('penjRfid').value = item.rfid;
        document.getElementById('penjEartag').value = item.eartag;
        document.getElementById('penjShipment').value = item.shipment;
        document.getElementById('penjBerat').value = item.berat;
        document.getElementById('penjTanggal').value = item.tanggalJual;
        document.getElementById('penjPembeli').value = item.pembeli;
        // Remove from cart
        cartItems = cartItems.filter(i => i.id !== id);
        refreshCartTable();
    }

    // --- Save cart to DB ---
    async function saveCartToDb() {
        for (const item of cartItems) {
            await DB.add('penjualan', {
                rfid: item.rfid,
                pembeli: item.pembeli,
                tanggalJual: item.tanggalJual,
                eartag: item.eartag,
                shipment: item.shipment,
                berat: item.berat
            });
        }
        DB.addLog('Penjualan', `Saved ${cartItems.length} items for ${cartItems[0]?.pembeli || 'unknown'}`);
    }

    // --- Export PDF Invoice ---
    async function exportPdf() {
        if (cartItems.length === 0) { Utils.showToast('Tidak ada data untuk di-export', 'warning'); return; }

        // Save to DB first
        await saveCartToDb();

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: printSettings.orientation,
            unit: 'mm',
            format: printSettings.pageSize
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        let yPos = 15;

        // Logo
        if (printSettings.logoDataUrl) {
            try {
                doc.addImage(printSettings.logoDataUrl, 'PNG', 10, 10, 30, 30);
                yPos = 15;
            } catch (e) { /* ignore logo errors */ }
        }

        // Header
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text(printSettings.header || 'Invoice', pageWidth / 2, yPos, { align: 'center' });
        yPos += 7;

        if (printSettings.subHeader) {
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(printSettings.subHeader, pageWidth / 2, yPos, { align: 'center' });
            yPos += 7;
        }

        // Invoice info
        doc.setFontSize(10);
        doc.text(`Pembeli: ${cartItems[0].pembeli}`, 14, yPos);
        yPos += 5;
        doc.text(`Tanggal: ${Utils.formatDate(cartItems[0].tanggalJual)}`, 14, yPos);
        yPos += 8;

        // Table
        const tableData = cartItems.map((item, i) => [
            i + 1,
            item.rfid,
            item.eartag || '-',
            item.shipment || '-',
            Utils.formatNumber(item.berat) + ' Kg'
        ]);

        const totalBerat = cartItems.reduce((sum, item) => sum + (item.berat || 0), 0);
        tableData.push(['', '', '', 'Total:', Utils.formatNumber(totalBerat) + ' Kg']);

        doc.autoTable({
            startY: yPos,
            head: [['No', 'RFID', 'Eartag', 'Shipment', 'Berat (Kg)']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [15, 52, 96] },
            styles: { fontSize: 9 },
            margin: { left: 14, right: 14 }
        });

        // Footer
        if (printSettings.footer) {
            const finalY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(8);
            doc.text(printSettings.footer, pageWidth / 2, finalY, { align: 'center' });
        }

        doc.save(`invoice_${cartItems[0].pembeli}_${Utils.todayStr()}.pdf`);
        Utils.showToast('Invoice PDF berhasil di-export', 'success');

        // Clear cart after export & refresh history
        cartItems = [];
        refreshCartTable();
        await refreshHistory();
    }

    // --- Export Staff Excel (with DOF/ADG calculations) ---
    async function exportStaffExcel() {
        if (cartItems.length === 0) { Utils.showToast('Tidak ada data untuk di-export', 'warning'); return; }

        // Save to DB first
        await saveCartToDb();

        const exportData = [];
        for (const item of cartItems) {
            // Lookup Induksi data
            const indData = await DB.get('induksi', item.rfid);
            // Lookup Reweight data (latest)
            const allRew = await DB.getAllByIndex('reweight', 'rfid', item.rfid);
            const rewData = allRew.length > 0 ? allRew[allRew.length - 1] : null;

            const dofInduksi = indData ? Utils.calculateDOF(indData.tanggal, item.tanggalJual) : '';
            const adgInduksi = (indData && dofInduksi > 0) ? Utils.calculateADG(indData.berat, item.berat, dofInduksi) : '';

            let dofReweight = '';
            let adgReweight = '';
            if (rewData) {
                dofReweight = Utils.calculateDOF(rewData.tanggal, item.tanggalJual);
                adgReweight = dofReweight > 0 ? Utils.calculateADG(rewData.berat, item.berat, dofReweight) : '';
            }

            exportData.push({
                RFID: item.rfid,
                Eartag: item.eartag,
                Shipment: item.shipment,
                Pembeli: item.pembeli,
                'Tanggal Jual': item.tanggalJual,
                'Berat Jual (Kg)': item.berat,
                'Berat Induksi (Kg)': indData ? indData.berat : '',
                'Tanggal Induksi': indData ? indData.tanggal : '',
                'DOF Induksi': dofInduksi,
                'ADG Induksi': adgInduksi,
                'Berat Reweight (Kg)': rewData ? rewData.berat : '',
                'Tanggal Reweight': rewData ? rewData.tanggal : '',
                'DOF Reweight': dofReweight,
                'ADG Reweight': adgReweight
            });
        }

        Utils.exportToExcel(exportData, `penjualan_staff_${Utils.todayStr()}.xlsx`, 'Penjualan Staff');

        // Clear cart after export & refresh history
        cartItems = [];
        refreshCartTable();
        await refreshHistory();
    }

    // --- Print Settings ---
    async function savePrintSettings() {
        printSettings.header = document.getElementById('printHeader').value;
        printSettings.subHeader = document.getElementById('printSubHeader').value;
        printSettings.footer = document.getElementById('printFooter').value;
        printSettings.pageSize = document.getElementById('printPageSize').value;
        printSettings.orientation = document.getElementById('printOrientation').value;

        await DB.add('settings', { key: 'printSettings', value: printSettings });
        Utils.closeModal('modalPrintSettings');
        Utils.showToast('Print settings disimpan', 'success');
    }

    async function loadPrintSettings() {
        const saved = await DB.get('settings', 'printSettings');
        if (saved && saved.value) {
            Object.assign(printSettings, saved.value);
        }
    }

    function handleLogoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            printSettings.logoDataUrl = ev.target.result;
            Utils.showToast('Logo berhasil di-upload', 'success');
        };
        reader.readAsDataURL(file);
    }

    // =============================================
    // RIWAYAT (HISTORY) — loaded from IndexedDB
    // =============================================

    async function refreshHistory() {
        const allData = await DB.getAll('penjualan');
        const filterPembeli = document.getElementById('penjHistoryFilter').value;

        // Update filter dropdown with unique pembeli values
        const pembeliSet = new Set(allData.map(d => d.pembeli).filter(Boolean));
        const filterSelect = document.getElementById('penjHistoryFilter');
        const currentFilter = filterSelect.value;
        filterSelect.innerHTML = '<option value="">Semua Pembeli</option>';
        pembeliSet.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            filterSelect.appendChild(opt);
        });
        filterSelect.value = currentFilter;

        // Filter data
        const filtered = filterPembeli ? allData.filter(d => d.pembeli === filterPembeli) : allData;

        const tbody = document.getElementById('penjHistoryBody');
        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Belum ada riwayat</td></tr>';
            return;
        }

        // Sort by newest first
        filtered.sort((a, b) => (b.tanggalJual || '').localeCompare(a.tanggalJual || ''));

        filtered.forEach((item, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="checkbox" class="penj-hist-check" value="${item.id}"></td>
                <td>${i + 1}</td>
                <td>${item.rfid || '-'}</td>
                <td>${item.eartag || '-'}</td>
                <td>${item.shipment || '-'}</td>
                <td>${item.pembeli || '-'}</td>
                <td>${Utils.formatNumber(item.berat)}</td>
                <td>${Utils.formatDate(item.tanggalJual)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function getSelectedHistoryItems() {
        const checked = document.querySelectorAll('.penj-hist-check:checked');
        return Array.from(checked).map(cb => cb.value);
    }

    async function getHistoryDataForExport() {
        const allData = await DB.getAll('penjualan');
        const filterPembeli = document.getElementById('penjHistoryFilter').value;
        const selectedIds = getSelectedHistoryItems();

        let data;
        if (selectedIds.length > 0) {
            // Export only selected items
            data = allData.filter(d => selectedIds.includes(String(d.id)));
        } else if (filterPembeli) {
            // Export filtered by pembeli
            data = allData.filter(d => d.pembeli === filterPembeli);
        } else {
            data = allData;
        }
        return data;
    }

    async function exportHistoryPdf() {
        const data = await getHistoryDataForExport();
        if (data.length === 0) { Utils.showToast('Tidak ada data riwayat untuk di-export', 'warning'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: printSettings.orientation,
            unit: 'mm',
            format: printSettings.pageSize
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        let yPos = 15;

        if (printSettings.logoDataUrl) {
            try { doc.addImage(printSettings.logoDataUrl, 'PNG', 10, 10, 30, 30); } catch (e) { }
        }

        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text(printSettings.header || 'Invoice', pageWidth / 2, yPos, { align: 'center' });
        yPos += 7;

        if (printSettings.subHeader) {
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(printSettings.subHeader, pageWidth / 2, yPos, { align: 'center' });
            yPos += 7;
        }

        doc.setFontSize(10);
        doc.text(`Pembeli: ${data[0].pembeli || '-'}`, 14, yPos);
        yPos += 5;
        doc.text(`Tanggal: ${Utils.formatDate(data[0].tanggalJual)}`, 14, yPos);
        yPos += 8;

        const tableData = data.map((item, i) => [
            i + 1, item.rfid, item.eartag || '-', item.shipment || '-',
            Utils.formatNumber(item.berat) + ' Kg'
        ]);
        const totalBerat = data.reduce((sum, item) => sum + (item.berat || 0), 0);
        tableData.push(['', '', '', 'Total:', Utils.formatNumber(totalBerat) + ' Kg']);

        doc.autoTable({
            startY: yPos,
            head: [['No', 'RFID', 'Eartag', 'Shipment', 'Berat (Kg)']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [15, 52, 96] },
            styles: { fontSize: 9 },
            margin: { left: 14, right: 14 }
        });

        if (printSettings.footer) {
            const finalY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(8);
            doc.text(printSettings.footer, pageWidth / 2, finalY, { align: 'center' });
        }

        doc.save(`invoice_riwayat_${data[0].pembeli || 'all'}_${Utils.todayStr()}.pdf`);
        Utils.showToast('Invoice PDF riwayat berhasil di-export', 'success');
    }

    async function exportHistoryStaffExcel() {
        const data = await getHistoryDataForExport();
        if (data.length === 0) { Utils.showToast('Tidak ada data riwayat untuk di-export', 'warning'); return; }

        const exportData = [];
        for (const item of data) {
            const indData = await DB.get('induksi', item.rfid);
            const allRew = await DB.getAllByIndex('reweight', 'rfid', item.rfid);
            const rewData = allRew.length > 0 ? allRew[allRew.length - 1] : null;

            const dofInduksi = indData ? Utils.calculateDOF(indData.tanggal, item.tanggalJual) : '';
            const adgInduksi = (indData && dofInduksi > 0) ? Utils.calculateADG(indData.berat, item.berat, dofInduksi) : '';

            let dofReweight = '';
            let adgReweight = '';
            if (rewData) {
                dofReweight = Utils.calculateDOF(rewData.tanggal, item.tanggalJual);
                adgReweight = dofReweight > 0 ? Utils.calculateADG(rewData.berat, item.berat, dofReweight) : '';
            }

            exportData.push({
                RFID: item.rfid,
                Eartag: item.eartag,
                Shipment: item.shipment,
                Pembeli: item.pembeli,
                'Tanggal Jual': item.tanggalJual,
                'Berat Jual (Kg)': item.berat,
                'Berat Induksi (Kg)': indData ? indData.berat : '',
                'Tanggal Induksi': indData ? indData.tanggal : '',
                'DOF Induksi': dofInduksi,
                'ADG Induksi': adgInduksi,
                'Berat Reweight (Kg)': rewData ? rewData.berat : '',
                'Tanggal Reweight': rewData ? rewData.tanggal : '',
                'DOF Reweight': dofReweight,
                'ADG Reweight': adgReweight
            });
        }

        Utils.exportToExcel(exportData, `penjualan_staff_riwayat_${Utils.todayStr()}.xlsx`, 'Penjualan Staff');
        Utils.showToast('Staff Excel riwayat berhasil di-export', 'success');
    }

    async function deleteSelectedHistory() {
        const selectedIds = getSelectedHistoryItems();
        if (selectedIds.length === 0) { Utils.showToast('Pilih data yang ingin dihapus', 'warning'); return; }
        if (!confirm(`Hapus ${selectedIds.length} data penjualan?`)) return;

        for (const id of selectedIds) {
            await DB.delete('penjualan', parseInt(id) || id);
        }
        Utils.showToast(`${selectedIds.length} data berhasil dihapus`, 'success');
        await refreshHistory();
    }

    return {
        init, loadDropdowns, refreshCartTable, refreshHistory,
        removeCartItem, editCartItem
    };
})();
