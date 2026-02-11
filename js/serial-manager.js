/**
 * Web Serial API Manager for Cattle Management System
 */

class SerialManager {
  constructor() {
    this.scannerPort = null;
    this.scalePort = null;
    this.scannerReader = null;
    this.scaleReader = null;
    this.scannerBuffer = '';
    this.scaleBuffer = '';
    this.isScannerReading = false;
    this.isScaleReading = false;
  }

  isSupported() {
    return 'serial' in navigator;
  }

  async connectScanner(baudRate = 9600) {
    if (!this.isSupported()) {
      Utils.showToast('Web Serial API tidak didukung. Gunakan Chrome/Edge.', 'error');
      return false;
    }
    try {
      this.scannerPort = await navigator.serial.requestPort();
      await this.scannerPort.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
      this.updateDot('dotScanner', true);
      Utils.showToast('Scanner terhubung', 'success');
      DB.addLog('Serial', 'Scanner connected');
      this.startScannerReader();
      return true;
    } catch (error) {
      console.error('Scanner connection error:', error);
      Utils.showToast('Gagal menghubungkan scanner: ' + error.message, 'error');
      return false;
    }
  }

  async connectScale(baudRate = 9600) {
    if (!this.isSupported()) {
      Utils.showToast('Web Serial API tidak didukung. Gunakan Chrome/Edge.', 'error');
      return false;
    }
    try {
      this.scalePort = await navigator.serial.requestPort();
      await this.scalePort.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
      this.updateDot('dotScale', true);
      Utils.showToast('Timbangan terhubung', 'success');
      DB.addLog('Serial', 'Scale connected');
      this.startScaleReader();
      return true;
    } catch (error) {
      console.error('Scale connection error:', error);
      Utils.showToast('Gagal menghubungkan timbangan: ' + error.message, 'error');
      return false;
    }
  }

  async startScannerReader() {
    if (!this.scannerPort?.readable) return;
    this.isScannerReading = true;
    const textDecoder = new TextDecoderStream();
    this.scannerPort.readable.pipeTo(textDecoder.writable);
    this.scannerReader = textDecoder.readable.getReader();

    try {
      while (this.isScannerReading) {
        const { value, done } = await this.scannerReader.read();
        if (done) break;
        if (value) this.processScannerData(value);
      }
    } catch (error) {
      if (this.isScannerReading) console.error('Scanner read error:', error);
    } finally {
      this.scannerReader.releaseLock();
    }
  }

  async startScaleReader() {
    if (!this.scalePort?.readable) return;
    this.isScaleReading = true;
    const textDecoder = new TextDecoderStream();
    this.scalePort.readable.pipeTo(textDecoder.writable);
    this.scaleReader = textDecoder.readable.getReader();

    try {
      while (this.isScaleReading) {
        const { value, done } = await this.scaleReader.read();
        if (done) break;
        if (value) this.processScaleData(value);
      }
    } catch (error) {
      if (this.isScaleReading) console.error('Scale read error:', error);
    } finally {
      this.scaleReader.releaseLock();
    }
  }

  processScannerData(data) {
    this.scannerBuffer += data;
    console.log('Raw scanner data:', data); // debug

    const lines = this.scannerBuffer.split(/[\r\n]+/);
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line.length > 0) {
        const rfid = this.extractRfid(line);
        if (rfid) {
          window.dispatchEvent(new CustomEvent('scanner-data', { detail: { rfid } }));
        }
      }
    }
    this.scannerBuffer = lines[lines.length - 1];
  }

  extractRfid(data) {
    const cleaned = data.replace(/[^\d]/g, '');
    const match = cleaned.match(/\d{10,20}/); // fleksibel: 10–20 digit
    return match ? match[0] : null;
  }

  processScaleData(data) {
    this.scaleBuffer += data;
    const lines = this.scaleBuffer.split(/[\r\n]+/);
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line.length > 0) {
        const weight = this.extractWeight(line);
        if (weight !== null) {
          window.dispatchEvent(new CustomEvent('scale-data', { detail: { weight } }));
        }
      }
    }
    this.scaleBuffer = lines[lines.length - 1];
  }

  extractWeight(data) {
    const match = data.match(/-?\d+\.?\d*/);
    if (match) {
      const weight = parseFloat(match[0]);
      if (weight >= 0 && weight <= 2000) return weight;
    }
    return null;
  }

  async disconnectScanner() {
    this.isScannerReading = false;
    try {
      if (this.scannerReader) { await this.scannerReader.cancel(); this.scannerReader = null; }
      if (this.scannerPort) { await this.scannerPort.close(); this.scannerPort = null; }
      this.scannerBuffer = '';
      this.updateDot('dotScanner', false);
      Utils.showToast('Scanner terputus', 'info');
      DB.addLog('Serial', 'Scanner disconnected');
    } catch (error) {
      console.error('Scanner disconnect error:', error);
    }
  }

  async disconnectScale() {
    this.isScaleReading = false;
    try {
      if (this.scaleReader) { await this.scaleReader.cancel(); this.scaleReader = null; }
      if (this.scalePort) { await this.scalePort.close(); this.scalePort = null; }
      this.scaleBuffer = '';
      this.updateDot('dotScale', false);
      Utils.showToast('Timbangan terputus', 'info');
      DB.addLog('Serial', 'Scale disconnected');
    } catch (error) {
      console.error('Scale disconnect error:', error);
    }
  }

  updateDot(dotId, connected) {
    const dot = document.getElementById(dotId);
    if (dot) {
      if (connected) dot.classList.add('connected');
      else dot.classList.remove('connected');
    }
  }

  toggleScanner() {
    if (this.scannerPort) this.disconnectScanner();
    else this.connectScanner();
  }

  toggleScale() {
    if (this.scalePort) this.disconnectScale();
    else this.connectScale();
  }

  isScannerConnected() { return !!this.scannerPort; }
  isScaleConnected() { return !!this.scalePort; }
}

const serialManager = new SerialManager();
