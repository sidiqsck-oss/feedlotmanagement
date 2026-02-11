/* ============================================
   REWEIGHT MODULE — Reweight Data Entry
   Auto-lookup from Induksi DB
   ============================================ */
const Reweight = (() => {
    const TEMPLATE_HEADERS = ['RFID', 'TglInduksi', 'TglReweight', 'Eartag', 'Shipment', 'BeratReweight', 'PenInduksi', 'PenAwal', 'PenAkhir', 'DOF', 'ADG', 'Frame', 'Vitamin', 'JenisSapi'];
    let currentInduksiData = null; // Holds the looked-up Induksi record

    // --- Initialize ---
    async function init() {
        document.getElementById('rewTanggal').value = Utils.todayStr();
        await refreshTable();
        await refreshSummary();
        bindEvents();
    }

    // --- Bind events ---
    function bindEvents() {
        document.getElementById('btnReweightInput').addEventListener('click', saveData);
        document.getElementById('btnReweightClear').addEventListener('click', clearForm);

        // RFID lookup on change/enter
        document.getElementById('rewRfid').addEventListener('change', lookupRfid);
        document.getElementById('rewRfid').addEventListener('keydown', (e) => { if (e.key === 'Enter') lookupRfid(); });

        // Recalculate DOF/ADG when date or weight changes
        document.getElementById('rewTanggal').addEventListener('change', recalculate);
        document.getElementById('rewBerat').addEventListener('input', recalculate);

        // Table actions
        document.getElementById('btnRewDeleteSelected').addEventListener('click', deleteSelected);
        document.getElementById('btnRewExportExcel').addEventListener('click', exportExcel);
        document.getElementById('btnRewImportExcel').addEventListener('click', () => document.getElementById('rewImportFile').click());
        document.getElementById('rewImportFile').addEventListener('change', importExcel);
        document.getElementById('btnRewDownloadTemplate').addEventListener('click', downloadTemplate);

        document.getElementById('rewCheckAll').addEventListener('change', (e) => {
            document.querySelectorAll('#rewTableBody input[type="checkbox"]').forEach(cb => cb.checked = e.target.checked);
        });

        // Summary
        document.getElementById('rewSummaryFilter').addEventListener('change', refreshSummary);
        document.getElementById('btnRewSummaryExport').addEventListener('click', exportSummary);

        // Summary tab toggles
        document.querySelectorAll('.tab-group .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                if (!tabId || !tabId.startsWith('rewSummary')) return;
                // Toggle active state
                e.target.closest('.tab-group').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                // Toggle content
                document.getElementById('rewSummaryAwal').classList.toggle('hidden', tabId !== 'rewSummaryAwal');
                document.getElementById('rewSummaryAkhir').classList.toggle('hidden', tabId !== 'rewSummaryAkhir');
            });
        });

        // Scanner auto-fill
        window.addEventListener('scanner-data', (e) => {
            const activePage = document.querySelector('.page-section.active');
            if (activePage && activePage.id === 'pageReweight') {
                document.getElementById('rewRfid').value = e.detail.rfid;
                lookupRfid();
            }
        });

        // Scale → capture weight
        window.addEventListener('scale-data', (e) => {
            const activePage = document.querySelector('.page-section.active');
            if (activePage && activePage.id === 'pageReweight') {
                document.getElementById('rewBerat').value = e.detail.weight.toFixed(1);
                recalculate();
            }
        });
    }

    // --- RFID Lookup ---
    async function lookupRfid() {
        const rfid = document.getElementById('rewRfid').value.trim();
        if (!rfid) return;

        const induksiRecord = await DB.get('induksi', rfid);
        if (!induksiRecord) {
            Utils.showToast('RFID tidak ditemukan di data Induksi', 'warning');
            currentInduksiData = null;
            return;
        }

        currentInduksiData = induksiRecord;

        // Auto-fill from Induksi
        document.getElementById('rewTglInduksi').value = induksiRecord.tanggal || '';
        document.getElementById('rewEartag').value = induksiRecord.eartag || '';
        document.getElementById('rewShipment').value = induksiRecord.shipment || '';
        document.getElementById('rewPenInduksi').value = induksiRecord.pen || '';
        document.getElementById('rewFrame').value = induksiRecord.frame || '';
        document.getElementById('rewJenisSapi').value = induksiRecord.jenisSapi || '';

        Utils.showToast(`Data ditemukan: ${induksiRecord.eartag || rfid}`, 'success');
        recalculate();
    }

    // --- Recalculate DOF & ADG ---
    function recalculate() {
        if (!currentInduksiData) return;
        const tglInduksi = currentInduksiData.tanggal;
        const tglReweight = document.getElementById('rewTanggal').value;
        const beratReweight = parseFloat(document.getElementById('rewBerat').value) || 0;
        const beratInduksi = currentInduksiData.berat || 0;

        const dof = Utils.calculateDOF(tglInduksi, tglReweight);
        const adg = Utils.calculateADG(beratInduksi, beratReweight, dof);

        document.getElementById('rewDof').value = dof;
        document.getElementById('rewAdg').value = adg.toFixed(2);
    }

    // --- Save Data ---
    async function saveData() {
        const rfid = document.getElementById('rewRfid').value.trim();
        if (!rfid) { Utils.showToast('RFID tidak boleh kosong', 'warning'); return; }
        if (!currentInduksiData) { Utils.showToast('Lakukan scan RFID terlebih dahulu', 'warning'); return; }

        const data = {
            rfid,
            tglInduksi: document.getElementById('rewTglInduksi').value,
            tanggal: document.getElementById('rewTanggal').value,
            eartag: document.getElementById('rewEartag').value,
            shipment: document.getElementById('rewShipment').value,
            berat: parseFloat(document.getElementById('rewBerat').value) || 0,
            beratInduksi: currentInduksiData.berat || 0,
            penInduksi: document.getElementById('rewPenInduksi').value,
            penAwal: document.getElementById('rewPenAwal').value.trim(),
            penAkhir: document.getElementById('rewPenAkhir').value.trim(),
            dof: parseInt(document.getElementById('rewDof').value) || 0,
            adg: parseFloat(document.getElementById('rewAdg').value) || 0,
            frame: document.getElementById('rewFrame').value,
            vitamin: parseInt(document.getElementById('rewVitamin').value) || 1,
            jenisSapi: document.getElementById('rewJenisSapi').value
        };

        try {
            await DB.add('reweight', data);
            Utils.showToast('Data reweight berhasil disimpan', 'success');
            DB.addLog('Reweight', `Saved RFID: ${rfid}`);
            clearForm();
            await refreshTable();
            await refreshSummary();
        } catch (err) {
            console.error('Save reweight error:', err);
            Utils.showToast('Gagal menyimpan: ' + err.message, 'error');
        }
    }

    // --- Clear form ---
    function clearForm() {
        currentInduksiData = null;
        const ids = ['rewRfid', 'rewTglInduksi', 'rewEartag', 'rewShipment', 'rewBerat', 'rewPenInduksi', 'rewPenAwal', 'rewPenAkhir', 'rewDof', 'rewAdg', 'rewFrame', 'rewJenisSapi'];
        ids.forEach(id => document.getElementById(id).value = '');
        document.getElementById('rewVitamin').value = '1';
        document.getElementById('rewTanggal').value = Utils.todayStr();
    }

    // --- Refresh Table ---
    async function refreshTable() {
        const data = await DB.getAll('reweight');
        const tbody = document.getElementById('rewTableBody');
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="16" class="text-center text-muted">Belum ada data</td></tr>';
            return;
        }
        data.forEach((item, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="checkbox-col"><input type="checkbox" data-id="${item.id}"></td>
                <td>${i + 1}</td>
                <td>${item.rfid}</td>
                <td>${Utils.formatDate(item.tglInduksi)}</td>
                <td>${Utils.formatDate(item.tanggal)}</td>
                <td>${item.eartag || '-'}</td>
                <td>${item.shipment || '-'}</td>
                <td>${Utils.formatNumber(item.berat)}</td>
                <td>${item.penInduksi || '-'}</td>
                <td>${item.penAwal || '-'}</td>
                <td>${item.penAkhir || '-'}</td>
                <td>${item.dof}</td>
                <td>${item.adg ? item.adg.toFixed(2) : '0.00'}</td>
                <td>${item.frame || '-'}</td>
                <td>${item.vitamin}</td>
                <td>${item.jenisSapi || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- Delete selected ---
    async function deleteSelected() {
        const checked = document.querySelectorAll('#rewTableBody input[type="checkbox"]:checked');
        if (checked.length === 0) { Utils.showToast('Pilih data yang ingin dihapus', 'warning'); return; }
        if (!confirm(`Hapus ${checked.length} data?`)) return;
        for (const cb of checked) {
            await DB.remove('reweight', parseInt(cb.dataset.id));
        }
        Utils.showToast(`${checked.length} data berhasil dihapus`, 'success');
        document.getElementById('rewCheckAll').checked = false;
        await refreshTable();
        await refreshSummary();
    }

    // --- Export ---
    async function exportExcel() {
        const data = await DB.getAll('reweight');
        const exportData = data.map(d => ({
            RFID: d.rfid,
            'Tgl Induksi': d.tglInduksi,
            'Tgl Reweight': d.tanggal,
            Eartag: d.eartag,
            Shipment: d.shipment,
            'Berat Reweight': d.berat,
            'PEN Induksi': d.penInduksi,
            'PEN Awal': d.penAwal,
            'PEN Akhir': d.penAkhir,
            DOF: d.dof,
            ADG: d.adg,
            Frame: d.frame,
            Vitamin: d.vitamin,
            'Jenis Sapi': d.jenisSapi
        }));
        Utils.exportToExcel(exportData, `reweight_${Utils.todayStr()}.xlsx`, 'Reweight');
    }

    // --- Import ---
    async function importExcel(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const rows = await Utils.readExcel(file);
            let count = 0;
            for (const row of rows) {
                const data = {
                    rfid: String(row.RFID || row.rfid || '').trim(),
                    tglInduksi: String(row.TglInduksi || row.tglInduksi || row['Tgl Induksi'] || ''),
                    tanggal: String(row.TglReweight || row.tanggal || row['Tgl Reweight'] || Utils.todayStr()),
                    eartag: String(row.Eartag || row.eartag || ''),
                    shipment: String(row.Shipment || row.shipment || ''),
                    berat: parseFloat(row.BeratReweight || row.berat || row['Berat Reweight'] || 0),
                    penInduksi: String(row.PenInduksi || row.penInduksi || row['PEN Induksi'] || ''),
                    penAwal: String(row.PenAwal || row.penAwal || row['PEN Awal'] || ''),
                    penAkhir: String(row.PenAkhir || row.penAkhir || row['PEN Akhir'] || ''),
                    dof: parseInt(row.DOF || row.dof || 0),
                    adg: parseFloat(row.ADG || row.adg || 0),
                    frame: String(row.Frame || row.frame || ''),
                    vitamin: parseInt(row.Vitamin || row.vitamin || 1),
                    jenisSapi: String(row.JenisSapi || row.jenisSapi || row['Jenis Sapi'] || '')
                };
                if (data.rfid) {
                    await DB.add('reweight', data);
                    count++;
                }
            }
            Utils.showToast(`${count} data berhasil di-import`, 'success');
            await refreshTable();
            await refreshSummary();
        } catch (err) {
            console.error('Import error:', err);
            Utils.showToast('Gagal import: ' + err.message, 'error');
        }
        e.target.value = '';
    }

    function downloadTemplate() {
        Utils.downloadTemplate(TEMPLATE_HEADERS, 'template_reweight.xlsx');
    }

    // --- Dual Summary (PEN Awal & PEN Akhir) ---
    async function refreshSummary() {
        const shipmentFilter = document.getElementById('rewSummaryFilter').value;
        let data = await DB.getAll('reweight');
        if (shipmentFilter) data = data.filter(d => d.shipment === shipmentFilter);

        // Update shipment filter dropdown
        await refreshSummaryFilter();

        // PEN Awal summary
        buildSummaryTable(data, 'penAwal', 'rewSummaryAwalBody');
        // PEN Akhir summary
        buildSummaryTable(data, 'penAkhir', 'rewSummaryAkhirBody');
    }

    function buildSummaryTable(data, penField, tbodyId) {
        const groups = {};
        data.forEach(d => {
            const p = d[penField] || 'TANPA PEN';
            if (!groups[p]) groups[p] = { count: 0, totalBerat: 0, totalAdg: 0, jenisSapi: new Set() };
            groups[p].count++;
            groups[p].totalBerat += d.berat || 0;
            groups[p].totalAdg += d.adg || 0;
            if (d.jenisSapi) groups[p].jenisSapi.add(d.jenisSapi);
        });

        const tbody = document.getElementById(tbodyId);
        tbody.innerHTML = '';
        const pens = Object.keys(groups).sort();
        if (pens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Belum ada data</td></tr>';
            return;
        }
        pens.forEach(pen => {
            const g = groups[pen];
            const avgBerat = g.count > 0 ? (g.totalBerat / g.count).toFixed(1) : 0;
            const avgAdg = g.count > 0 ? (g.totalAdg / g.count).toFixed(2) : 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${pen}</td>
                <td>${g.count}</td>
                <td>${Utils.formatNumber(g.totalBerat)}</td>
                <td>${Utils.formatNumber(avgBerat)}</td>
                <td>${avgAdg}</td>
                <td>${[...g.jenisSapi].join(', ') || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    async function refreshSummaryFilter() {
        const data = await DB.getAll('reweight');
        const shipments = [...new Set(data.map(d => d.shipment).filter(Boolean))].sort();
        const select = document.getElementById('rewSummaryFilter');
        const current = select.value;
        select.innerHTML = '<option value="">Semua Shipment</option>';
        shipments.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            select.appendChild(opt);
        });
        if (current) select.value = current;
    }

    async function exportSummary() {
        const shipmentFilter = document.getElementById('rewSummaryFilter').value;
        let data = await DB.getAll('reweight');
        if (shipmentFilter) data = data.filter(d => d.shipment === shipmentFilter);

        const buildExport = (penField, label) => {
            const groups = {};
            data.forEach(d => {
                const p = d[penField] || 'TANPA PEN';
                if (!groups[p]) groups[p] = { count: 0, totalBerat: 0, totalAdg: 0, jenisSapi: new Set() };
                groups[p].count++;
                groups[p].totalBerat += d.berat || 0;
                groups[p].totalAdg += d.adg || 0;
                if (d.jenisSapi) groups[p].jenisSapi.add(d.jenisSapi);
            });
            return Object.keys(groups).sort().map(pen => ({
                [label]: pen,
                'Jumlah Sapi': groups[pen].count,
                'Total Berat': groups[pen].totalBerat.toFixed(1),
                'Avg Berat': (groups[pen].totalBerat / groups[pen].count).toFixed(1),
                'Avg ADG': (groups[pen].totalAdg / groups[pen].count).toFixed(2),
                'Jenis Sapi': [...groups[pen].jenisSapi].join(', ')
            }));
        };

        // Create workbook with two sheets
        const wb = XLSX.utils.book_new();
        const wsAwal = XLSX.utils.json_to_sheet(buildExport('penAwal', 'PEN Awal'));
        const wsAkhir = XLSX.utils.json_to_sheet(buildExport('penAkhir', 'PEN Akhir'));
        XLSX.utils.book_append_sheet(wb, wsAwal, 'PEN Awal');
        XLSX.utils.book_append_sheet(wb, wsAkhir, 'PEN Akhir');
        const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        Utils.downloadFile(blob, `summary_reweight_${Utils.todayStr()}.xlsx`);
        Utils.showToast('Summary berhasil di-export', 'success');
    }

    return { init, refreshTable, refreshSummary };
})();
