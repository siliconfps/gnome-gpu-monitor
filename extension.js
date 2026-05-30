const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const DRM_DIR = '/sys/class/drm';

function readSysfs(path) {
    try {
        let [ok, contents] = GLib.file_get_contents(path);
        if (ok) {
            return new TextDecoder('utf-8').decode(contents).trim();
        }
    } catch (e) {}
    return null;
}

function enumerateDir(path) {
    try {
        let dir = Gio.file_new_for_path(path);
        let enumerator = dir.enumerate_children('standard::name',
            Gio.FileQueryInfoFlags.NONE, null);
        let names = [];
        while (true) {
            let info = enumerator.next_file(null);
            if (!info) break;
            names.push(info.get_name());
        }
        return names;
    } catch (e) {
        return [];
    }
}

class GpuSource {
    constructor() {
        this._cardPath = null;
        this._hwmonPath = null;
        this._vendor = null;
        this._model = 'GPU';
        this._detect();
    }

    _detect() {
        let entries = enumerateDir(DRM_DIR);
        for (let name of entries) {
            if (!name.startsWith('card') || name.includes('-'))
                continue;

            let devicePath = `${DRM_DIR}/${name}/device`;
            let vendor = readSysfs(`${devicePath}/vendor`);

            if (vendor === '0x1002' || vendor === '0x10de') {
                this._cardPath = devicePath;
                this._vendor = vendor;

                this._model = readSysfs(`${devicePath}/product_name`)
                    || readSysfs(`${devicePath}/model`)
                    || (vendor === '0x1002' ? 'AMD GPU' : 'NVIDIA GPU');

                this._findHwmon(devicePath);
                return;
            }
        }
    }

    _findHwmon(devicePath) {
        let entries = enumerateDir(`${devicePath}/hwmon`);
        for (let name of entries) {
            if (name.startsWith('hwmon')) {
                this._hwmonPath = `${devicePath}/hwmon/${name}`;
                return;
            }
        }
    }

    get gpuUsage() {
        if (this._vendor === '0x1002')
            return readSysfs(`${this._cardPath}/gpu_busy_percent`);
        return null;
    }

    get vramUsage() {
        if (this._vendor === '0x1002')
            return readSysfs(`${this._cardPath}/mem_busy_percent`);
        return null;
    }

    get vramUsedBytes() {
        if (this._vendor === '0x1002') {
            let val = readSysfs(`${this._cardPath}/mem_info_vram_used`);
            return val ? parseInt(val) : null;
        }
        return null;
    }

    get vramTotalBytes() {
        if (this._vendor === '0x1002') {
            let val = readSysfs(`${this._cardPath}/mem_info_vram_total`);
            return val ? parseInt(val) : null;
        }
        return null;
    }

    get temperatureCelsius() {
        if (this._hwmonPath) {
            let val = readSysfs(`${this._hwmonPath}/temp1_input`);
            return val ? parseInt(val) / 1000 : null;
        }
        return null;
    }

    get powerWatts() {
        if (this._hwmonPath) {
            let val = readSysfs(`${this._hwmonPath}/power1_input`);
            return val ? parseInt(val) / 1000000 : null;
        }
        return null;
    }

    get gpuClockMhz() {
        if (this._hwmonPath) {
            let val = readSysfs(`${this._hwmonPath}/freq1_input`);
            if (val) return Math.round(parseInt(val) / 1000000);
        }
        if (this._vendor === '0x1002') {
            return this._extractActiveClock(
                readSysfs(`${this._cardPath}/pp_dpm_sclk`));
        }
        return null;
    }

    get memClockMhz() {
        if (this._hwmonPath) {
            let val = readSysfs(`${this._hwmonPath}/freq2_input`);
            if (val) return Math.round(parseInt(val) / 1000000);
        }
        if (this._vendor === '0x1002') {
            return this._extractActiveClock(
                readSysfs(`${this._cardPath}/pp_dpm_mclk`));
        }
        return null;
    }

    _extractActiveClock(content) {
        if (!content) return null;
        for (let line of content.split('\n')) {
            if (line.includes('*')) {
                let m = line.match(/(\d+)\s*Mhz/i);
                if (m) return parseInt(m[1]);
            }
        }
        return null;
    }

    get fanRpm() {
        if (this._hwmonPath) {
            let val = readSysfs(`${this._hwmonPath}/fan1_input`);
            return val ? parseInt(val) : null;
        }
        return null;
    }

    get modelName() {
        return this._model;
    }

    get available() {
        return this._cardPath !== null;
    }
}

var GpuMonitorIndicator = GObject.registerClass(
class GpuMonitorIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'GPU Monitor');

        this._source = new GpuSource();

        this._box = new St.BoxLayout({ style_class: 'panel-status-indicators-box' });
        this._icon = new St.Icon({
            icon_name: 'freon-gpu-temperature-symbolic',
            style_class: 'system-status-icon',
        });
        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'gpu-monitor-label',
        });

        this._box.add_child(this._icon);
        this._box.add_child(this._label);
        this.add_child(this._box);

        this._buildMenu();

        this._updateTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });

        this._update();
    }

    _buildMenu() {
        this._titleItem = new PopupMenu.PopupMenuItem('--', { reactive: false });
        this._titleItem.label.add_style_class_name('gpu-monitor-menu-item-value');
        this.menu.addMenuItem(this._titleItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._gpuUsageItem  = this._addInfoItem('GPU Usage');
        this._vramItem      = this._addInfoItem('VRAM');
        this._gpuClockItem  = this._addInfoItem('GPU Clock');
        this._memClockItem  = this._addInfoItem('Mem Clock');
        this._tempItem      = this._addInfoItem('Temperature');
        this._powerItem     = this._addInfoItem('Power');
    }

    _addInfoItem(label) {
        let item = new PopupMenu.PopupMenuItem(`${label}: --`, { reactive: false });
        this.menu.addMenuItem(item);
        return item;
    }

    _update() {
        if (!this._source.available) {
            this._label.set_text('\u26a1');
            return;
        }

        let parts = [];
        let usage   = this._source.gpuUsage;
        let temp    = this._source.temperatureCelsius;
        let gpuClk  = this._source.gpuClockMhz;

        if (usage !== null)  parts.push(`${usage}%`);
        if (temp !== null)   parts.push(`${Math.round(temp)}\u00b0C`);
        if (gpuClk !== null) parts.push(`${(gpuClk / 1000).toFixed(1).replace(/\.0$/, '')}GHz`);

        this._label.set_text(parts.join(' | '));

        if (usage !== null) {
            this._label.remove_style_class_name('gpu-monitor-usage-high');
            this._label.remove_style_class_name('gpu-monitor-usage-medium');
            this._label.remove_style_class_name('gpu-monitor-usage-low');
            let pct = parseInt(usage);
            if (pct >= 70)
                this._label.add_style_class_name('gpu-monitor-usage-high');
            else if (pct >= 40)
                this._label.add_style_class_name('gpu-monitor-usage-medium');
            else
                this._label.add_style_class_name('gpu-monitor-usage-low');
        }

        let memClk  = this._source.memClockMhz;
        let vramU   = this._source.vramUsedBytes;
        let vramT   = this._source.vramTotalBytes;
        let power   = this._source.powerWatts;

        this._titleItem.label.set_text(this._source.modelName);
        this._gpuUsageItem.label.set_text(
            `GPU Usage: ${usage !== null ? usage + '%' : '--'}`);
        this._gpuClockItem.label.set_text(
            `GPU Clock: ${gpuClk !== null ? (gpuClk / 1000).toFixed(1).replace(/\.0$/, '') + ' GHz' : '--'}`);
        this._memClockItem.label.set_text(
            `Mem Clock: ${memClk !== null ? (memClk / 1000).toFixed(1).replace(/\.0$/, '') + ' GHz' : '--'}`);

        if (vramU !== null && vramT !== null) {
            let usedMB  = Math.round(vramU / (1024 * 1024));
            let totalMB = Math.round(vramT / (1024 * 1024));
            let vramPct = Math.round((vramU / vramT) * 100);
            let busy    = this._source.vramUsage;
            this._vramItem.label.set_text(
                `VRAM: ${usedMB}/${totalMB} MB (${busy !== null ? busy + '%' : vramPct + '%'})`);
        } else {
            this._vramItem.label.set_text('VRAM: --');
        }

        if (temp !== null)
            this._tempItem.label.set_text(`Temperature: ${temp.toFixed(1)}\u00b0C`);
        if (power !== null)
            this._powerItem.label.set_text(`Power: ${power.toFixed(2)} W`);
    }

    destroy() {
        if (this._updateTimeout) {
            GLib.source_remove(this._updateTimeout);
            this._updateTimeout = null;
        }
        super.destroy();
    }
});

let _indicator = null;

function init() {}

function enable() {
    _indicator = new GpuMonitorIndicator();
    Main.panel.addToStatusArea('gpu-monitor', _indicator);
}

function disable() {
    if (_indicator) {
        _indicator.destroy();
        _indicator = null;
    }
}
