/* ============================================
   健身打卡 · 可爱健身日记
   数据存储 + 业务逻辑 + UI 渲染 + 主题调色盘
   ============================================ */

// ====== 主题预设 ======

const THEME_PRESETS = [
    {
        id: 'dusty_rose',
        name: '🌸 皮粉',
        primary: '#D9BEBE',      // 主色
        green: '#B0D2B8',         // 打卡绿
        red: '#E0A0A0',           // 涨秤红
    },
    {
        id: 'matcha',
        name: '🍵 奶绿',
        primary: '#B8CCC0',
        green: '#9DC9A8',
        red: '#D8A89E',
    },
    {
        id: 'sky_blue',
        name: '🌊 浅蓝',
        primary: '#BEC9D9',
        green: '#A9D1CF',
        red: '#D9A8B0',
    },
    {
        id: 'lavender',
        name: '💜 薰衣草',
        primary: '#C9BEDE',
        green: '#BEB6D9',
        red: '#D9A8B5',
    },
    {
        id: 'cream_apricot',
        name: '🍊 奶杏',
        primary: '#DCC2A8',
        green: '#C9C69E',
        red: '#D9A98A',
    },
    {
        id: 'peach',
        name: '🌷 蜜桃',
        primary: '#E0C4C9',
        green: '#B5CCBB',
        red: '#D9A8B1',
    },
];

// ====== 颜色工具 ======

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = h.length === 3
        ? h.split('').map(c => c + c).join('')
        : h;
    return {
        r: parseInt(n.slice(0, 2), 16),
        g: parseInt(n.slice(2, 4), 16),
        b: parseInt(n.slice(4, 6), 16),
    };
}

function rgbToHex({ r, g, b }) {
    const f = (n) => String(Math.round(Math.max(0, Math.min(255, n)))).padStart(2, '0');
    return `#${f(r)}${f(g)}${f(b)}`;
}

/**
 * 与白色按比例混合（明度提升）
 * @param {string} hex 基准色
 * @param {number} ratio 0 保持原色, 1 纯白
 */
function mixWithWhite(hex, ratio) {
    const c = hexToRgb(hex);
    return rgbToHex({
        r: c.r + (255 - c.r) * ratio,
        g: c.g + (255 - c.g) * ratio,
        b: c.b + (255 - c.b) * ratio,
    });
}

/**
 * 按「主色 + 打卡绿 + 涨秤红」推导完整 CSS 变量集
 */
function buildThemeVars({ primary, green, red }) {
    // 红/橙/紫保持原色系倾向，明度与原风格一致
    const orange = rgbToHex({
        r: Math.round((hexToRgb(primary).r + hexToRgb(red).r) / 2 + 10),
        g: Math.round((hexToRgb(primary).g + hexToRgb(red).g) / 2 + 20),
        b: Math.round(hexToRgb(primary).b - 10),
    });
    const purple = rgbToHex({
        r: Math.round((hexToRgb(primary).r + hexToRgb(primary).b) / 2),
        g: Math.round(hexToRgb(primary).g - 8),
        b: Math.round((hexToRgb(primary).r + hexToRgb(primary).b) / 2 + 20),
    });
    // 取主色的 RGB 用于阴影 alpha
    const pRgb = hexToRgb(primary);

    return {
        '--pink': primary,
        '--pink-light': mixWithWhite(primary, 0.55),  // 边框色
        '--pink-bg': mixWithWhite(primary, 0.9),      // 卡片背景灰
        '--pink-soft': mixWithWhite(primary, 0.75),   // 中灰
        '--green': green,
        '--green-light': mixWithWhite(green, 0.6),
        '--red': red,
        '--orange': orange,
        '--orange-light': mixWithWhite(orange, 0.7),
        '--purple': purple,
        '--purple-light': mixWithWhite(purple, 0.75),
        '--text-dark': '#5C5252',
        '--text-medium': '#8A8080',
        '--text-light': '#B0A6A6',
        '--white': '#FFFFFF',
        '--card-shadow': `0 4px 20px rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.12)`,
        '--card-shadow-hover': `0 6px 28px rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.2)`,
    };
}

function applyThemeVars(vars) {
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

    // body 背景渐变（跟随主色）
    const bg0 = mixWithWhite(vars['--pink'], 0.95);
    const bg1 = mixWithWhite(vars['--pink'], 0.9);
    document.body.style.background = `linear-gradient(180deg, ${bg0} 0%, ${bg1} 100%)`;

    // manifest/theme-color meta 也要同步
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', vars['--pink']);
}

function findPresetByColors({ primary, green }) {
    const match = THEME_PRESETS.find(
        (p) => p.primary.toLowerCase() === primary.toLowerCase()
            && p.green.toLowerCase() === green.toLowerCase()
    );
    return match ? match.id : null;
}

// ====== 数据层 ======

const Store = {
    KEY: 'fitness_diary_data',

    defaults() {
        const defaultPreset = THEME_PRESETS[0];
        return {
            profile: {
                nickname: '健身小可爱',
                avatar: '🐱',
                goalWeight: 100,    // 目标体重(斤)
                initWeight: 120,    // 初始体重(斤)
                unit: 'jin',        // jin | kg
            },
            theme: {
                primary: defaultPreset.primary,
                green: defaultPreset.green,
                red: defaultPreset.red,
            },
            records: {}, // { '2026-07-31': { checked: true, weight: 116.5 } }
        };
    },

    load() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (!raw) {
                const d = this.defaults();
                this.save(d);
                return d;
            }
            const parsed = JSON.parse(raw);
            // 老数据兼容：补上 theme 字段
            if (!parsed.theme) {
                parsed.theme = this.defaults().theme;
                this.save(parsed);
            }
            return parsed;
        } catch (e) {
            console.error('Load data error:', e);
            return this.defaults();
        }
    },

    save(data) {
        this._cache = data;
        localStorage.setItem(this.KEY, JSON.stringify(data));
    },

    get() {
        if (!this._cache) this._cache = this.load();
        return this._cache;
    },

    update(fn) {
        const data = this.get();
        fn(data);
        this.save(data);
    },

    // 体重单位换算
    toDisplay(weightJin, unit) {
        if (weightJin == null) return null;
        return unit === 'kg' ? +(weightJin / 2).toFixed(1) : +weightJin.toFixed(1);
    },

    toJin(weightDisplay, unit) {
        if (weightDisplay == null || weightDisplay === '') return null;
        return unit === 'kg' ? +(weightDisplay * 2).toFixed(1) : +weightDisplay.toFixed(1);
    },
};

// ====== 工具函数 ======

function todayStr() {
    const d = new Date();
    return fmtDate(d);
}

function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function getStreak(records) {
    let streak = 0;
    const d = new Date();
    while (true) {
        const key = fmtDate(d);
        if (records[key] && records[key].checked) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
        toast.style.display = 'none';
    }, 2200);
}

// ====== UI 渲染 ======

const App = {
    state: {
        viewMonth: new Date(),
        selectedDate: null,
        selectedAvatar: '🐱',
        backfillCheckin: false,
        // 调色盘临时状态（打开设置弹窗时使用，保存才落盘）
        theme: null,     // { primary, green, red }
        presetId: null,  // 当前匹配的预设 id
    },

    init() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }

        // 先应用保存的主题
        this.applyStoredTheme();

        this.bindEvents();
        this.render();
    },

    // ===== 主题 =====

    applyStoredTheme() {
        const t = Store.get().theme;
        applyThemeVars(buildThemeVars(t));
    },

    /** 预览/应用临时主题（用于设置弹窗中实时预览） */
    applyTempTheme() {
        const t = this.state.theme;
        if (!t) return;
        applyThemeVars(buildThemeVars(t));
        this.state.presetId = findPresetByColors(t);
        this.highlightActivePalette();
        this.syncCustomColorInputs();
    },

    /** 渲染调色盘预设卡片列表 */
    renderPaletteGrid() {
        const grid = document.getElementById('paletteGrid');
        const activeId = this.state.presetId;
        grid.innerHTML = THEME_PRESETS.map(p => {
            const vars = buildThemeVars({ primary: p.primary, green: p.green, red: p.red });
            const swatches = [vars['--pink'], vars['--green-light'], vars['--pink-bg']];
            const swatchesHtml = swatches.map(c => `<span class="palette-swatch" style="background:${c}"></span>`).join('');
            const activeClass = p.id === activeId ? ' active' : '';
            return `<div class="palette-item${activeClass}" data-preset="${p.id}">
                <div class="palette-preview">${swatchesHtml}</div>
                <div class="palette-name">${p.name}</div>
            </div>`;
        }).join('');

        // 绑定点击
        grid.querySelectorAll('.palette-item').forEach(el => {
            el.addEventListener('click', () => {
                const pid = el.dataset.preset;
                const preset = THEME_PRESETS.find(p => p.id === pid);
                if (!preset) return;
                this.state.theme = {
                    primary: preset.primary,
                    green: preset.green,
                    red: preset.red,
                };
                this.applyTempTheme();
            });
        });
    },

    highlightActivePalette() {
        const activeId = this.state.presetId;
        document.querySelectorAll('.palette-item').forEach(el => {
            el.classList.toggle('active', el.dataset.preset === activeId);
        });
    },

    syncCustomColorInputs() {
        const t = this.state.theme;
        if (!t) return;
        const primaryInput = document.getElementById('customPrimary');
        const greenInput = document.getElementById('customGreen');
        if (primaryInput && primaryInput.value.toLowerCase() !== t.primary.toLowerCase()) {
            primaryInput.value = t.primary;
        }
        if (greenInput && greenInput.value.toLowerCase() !== t.green.toLowerCase()) {
            greenInput.value = t.green;
        }
    },

    bindEvents() {
        // 打卡
        document.getElementById('checkinBtn').addEventListener('click', () => this.toggleCheckin());

        // 保存体重
        document.getElementById('saveWeightBtn').addEventListener('click', () => this.saveTodayWeight());
        document.getElementById('weightInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.saveTodayWeight();
        });

        // 单位切换
        document.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchUnit(btn.dataset.unit));
        });

        // 月份切换
        document.getElementById('prevMonth').addEventListener('click', () => this.changeMonth(-1));
        document.getElementById('nextMonth').addEventListener('click', () => this.changeMonth(1));

        // 设置
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        document.getElementById('settingsClose').addEventListener('click', () => this.closeModal('settingsModal'));
        document.getElementById('settingsCancel').addEventListener('click', () => this.closeModal('settingsModal'));
        document.getElementById('settingsSave').addEventListener('click', () => this.saveSettings());

        // 头像选择
        document.querySelectorAll('.avatar-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                this.state.selectedAvatar = opt.dataset.avatar;
            });
        });

        // 自定义颜色取色器
        document.getElementById('customPrimary').addEventListener('input', (e) => {
            if (!this.state.theme) return;
            this.state.theme.primary = e.target.value;
            // 主色变化时，红也跟着微调，保持色调协调
            const p = hexToRgb(e.target.value);
            const redHex = rgbToHex({
                r: Math.min(255, p.r + 10),
                g: Math.max(0, p.g - 10),
                b: Math.max(0, p.b - 10),
            });
            this.state.theme.red = redHex;
            this.applyTempTheme();
        });
        document.getElementById('customGreen').addEventListener('input', (e) => {
            if (!this.state.theme) return;
            this.state.theme.green = e.target.value;
            this.applyTempTheme();
        });

        // 补签弹窗
        document.getElementById('backfillClose').addEventListener('click', () => this.closeModal('backfillModal'));
        document.getElementById('backfillCancel').addEventListener('click', () => this.closeModal('backfillModal'));
        document.getElementById('backfillSave').addEventListener('click', () => this.saveBackfill());
        document.getElementById('backfillDelete').addEventListener('click', () => this.deleteBackfill());
        document.getElementById('backfillCheckinToggle').addEventListener('click', () => this.toggleBackfillCheckin());

        // 底部导航
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const page = btn.dataset.page;
                if (page === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
                else if (page === 'stats') {
                    const el = document.querySelector('.stats-card');
                    el && el.scrollIntoView({ behavior: 'smooth' });
                } else if (page === 'settings') this.openSettings();
            });
        });

        // 点击遮罩关闭
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.style.display = 'none';
            });
        });
    },

    render() {
        this.renderHeader();
        this.renderCheckin();
        this.renderWeightCard();
        this.renderCalendar();
        this.renderStats();
    },

    // === Header ===
    renderHeader() {
        const data = Store.get();
        const p = data.profile;
        const unitLabel = p.unit === 'kg' ? 'kg' : '斤';
        document.getElementById('avatar').textContent = p.avatar;
        document.getElementById('nickname').textContent = p.nickname;
        const goalDisplay = Store.toDisplay(p.goalWeight, p.unit);
        document.getElementById('goalWeightDisplay').textContent = `${goalDisplay}${unitLabel}`;
    },

    // === 打卡 ===
    renderCheckin() {
        const data = Store.get();
        const today = todayStr();
        const checked = data.records[today] && data.records[today].checked;
        const streak = getStreak(data.records);

        const d = new Date();
        const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        document.getElementById('todayDate').textContent =
            `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`;

        document.getElementById('streakDays').textContent = streak;

        const btn = document.getElementById('checkinBtn');
        if (checked) {
            btn.classList.add('checked', 'pulse');
            btn.querySelector('.checkin-text').textContent = '今日已打卡 ✓';
            btn.querySelector('.checkin-subtext').textContent = '继续加油，你超棒的！';
        } else {
            btn.classList.remove('checked');
            btn.querySelector('.checkin-text').textContent = '今日打卡';
            btn.querySelector('.checkin-subtext').textContent = '坚持就是胜利！';
        }
        setTimeout(() => btn.classList.remove('pulse'), 400);
    },

    toggleCheckin() {
        const data = Store.get();
        const today = todayStr();
        if (!data.records[today]) data.records[today] = {};
        const wasChecked = data.records[today].checked || false;
        data.records[today].checked = !wasChecked;
        Store.save(data);

        if (data.records[today].checked) {
            showToast('打卡成功！🎉');
        } else {
            showToast('已取消今日打卡');
        }
        this.render();
    },

    // === 体重 ===
    renderWeightCard() {
        const data = Store.get();
        const p = data.profile;
        const unitLabel = p.unit === 'kg' ? 'kg' : '斤';
        document.getElementById('weightUnitLabel').textContent = unitLabel;

        document.querySelectorAll('.unit-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.unit === p.unit);
        });

        const today = todayStr();
        const todayRec = data.records[today];
        const weightInput = document.getElementById('weightInput');
        if (todayRec && todayRec.weight != null) {
            weightInput.value = Store.toDisplay(todayRec.weight, p.unit);
        }

        const compEl = document.getElementById('weightComparison');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = fmtDate(yesterday);
        const yRec = data.records[yKey];

        if (todayRec && todayRec.weight != null && yRec && yRec.weight != null) {
            const diff = +(todayRec.weight - yRec.weight).toFixed(1);
            const diffDisplay = Store.toDisplay(Math.abs(diff), p.unit);
            if (diff < 0) {
                compEl.innerHTML = `<span class="comparison-icon">📉</span> 比昨天 <span class="down">↓${diffDisplay}${unitLabel}</span> 继续保持！`;
            } else if (diff > 0) {
                compEl.innerHTML = `<span class="comparison-icon">📈</span> 比昨天 <span class="up">↑${diffDisplay}${unitLabel}</span> 加油加油~`;
            } else {
                compEl.innerHTML = `<span class="comparison-icon">➡️</span> 和昨天一样，保持住！`;
            }
        } else if (todayRec && todayRec.weight != null) {
            compEl.innerHTML = `<span class="comparison-icon">✅</span> 今日已记录 ${Store.toDisplay(todayRec.weight, p.unit)}${unitLabel}`;
        } else {
            compEl.innerHTML = `<span class="comparison-icon">📊</span> 快记录今天的体重吧~`;
        }
    },

    saveTodayWeight() {
        const input = document.getElementById('weightInput');
        const val = parseFloat(input.value);
        if (isNaN(val) || val <= 0) {
            showToast('请输入有效体重');
            return;
        }
        const data = Store.get();
        const p = data.profile;
        const today = todayStr();
        if (!data.records[today]) data.records[today] = {};
        data.records[today].weight = Store.toJin(val, p.unit);
        Store.save(data);
        showToast('体重记录成功 ⚖️');
        this.render();
    },

    switchUnit(unit) {
        const data = Store.get();
        if (data.profile.unit === unit) return;
        data.profile.unit = unit;
        Store.save(data);
        this.render();
    },

    // === 日历 ===
    renderCalendar() {
        const data = Store.get();
        const p = data.profile;
        const vm = this.state.viewMonth;
        const year = vm.getFullYear();
        const month = vm.getMonth();

        document.getElementById('calendarTitle').textContent = `${year}年${month + 1}月`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = todayStr();
        const unitLabel = p.unit === 'kg' ? 'kg' : '斤';

        let html = '';
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="cal-day empty"></div>';
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const rec = data.records[dateStr];
            const classes = ['cal-day'];
            if (dateStr === today) classes.push('today');
            if (rec && rec.checked) classes.push('checked');
            if (rec && rec.weight != null) classes.push('has-weight');

            let weightHtml = '';
            if (rec && rec.weight != null) {
                const w = Store.toDisplay(rec.weight, p.unit);
                weightHtml = `<span class="day-weight">${w}</span>`;
            }

            html += `<div class="${classes.join(' ')}" data-date="${dateStr}">
                <span class="day-num">${d}</span>
                ${weightHtml}
            </div>`;
        }

        document.getElementById('calendarGrid').innerHTML = html;

        document.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
            el.addEventListener('click', () => this.openBackfill(el.dataset.date));
        });
    },

    changeMonth(delta) {
        const vm = this.state.viewMonth;
        vm.setMonth(vm.getMonth() + delta);
        this.renderCalendar();
    },

    // === 补签 ===
    openBackfill(dateStr) {
        const data = Store.get();
        const p = data.profile;
        const rec = data.records[dateStr] || {};
        this.state.selectedDate = dateStr;

        const d = parseDate(dateStr);
        document.getElementById('backfillDateTitle').textContent =
            `${d.getMonth() + 1}月${d.getDate()}日 补签`;

        const unitLabel = p.unit === 'kg' ? 'kg' : '斤';
        document.getElementById('modalWeightUnit').textContent = unitLabel;

        const weightInput = document.getElementById('backfillWeight');
        if (rec.weight != null) {
            weightInput.value = Store.toDisplay(rec.weight, p.unit);
        } else {
            weightInput.value = '';
        }

        this.state.backfillCheckin = rec.checked || false;
        this.updateBackfillToggle();

        document.getElementById('backfillDelete').style.display =
            (rec.checked || rec.weight != null) ? 'block' : 'none';

        document.getElementById('backfillModal').style.display = 'flex';
    },

    toggleBackfillCheckin() {
        this.state.backfillCheckin = !this.state.backfillCheckin;
        this.updateBackfillToggle();
    },

    updateBackfillToggle() {
        const toggle = document.getElementById('backfillCheckinToggle');
        if (this.state.backfillCheckin) {
            toggle.classList.add('active');
            toggle.textContent = '已打卡 ✓';
        } else {
            toggle.classList.remove('active');
            toggle.textContent = '未打卡';
        }
    },

    saveBackfill() {
        const dateStr = this.state.selectedDate;
        if (!dateStr) return;

        const data = Store.get();
        const p = data.profile;
        if (!data.records[dateStr]) data.records[dateStr] = {};

        const weightVal = parseFloat(document.getElementById('backfillWeight').value);
        if (!isNaN(weightVal) && weightVal > 0) {
            data.records[dateStr].weight = Store.toJin(weightVal, p.unit);
        } else if (weightVal === 0 || (document.getElementById('backfillWeight').value.trim() === '')) {
            // 体重输入为空 / 0 时，清除体重字段（但保留打卡状态）
            delete data.records[dateStr].weight;
        }

        data.records[dateStr].checked = this.state.backfillCheckin;

        // 若既没打卡又没体重，则删除这条空记录
        const rec = data.records[dateStr];
        const hasContent = rec.checked || rec.weight != null;
        if (!hasContent) {
            delete data.records[dateStr];
        }

        Store.save(data);
        showToast('补签成功 📝');
        this.closeModal('backfillModal');
        this.render();
    },

    deleteBackfill() {
        const dateStr = this.state.selectedDate;
        if (!dateStr) return;
        const data = Store.get();
        delete data.records[dateStr];
        Store.save(data);
        showToast('已删除该日记录');
        this.closeModal('backfillModal');
        this.render();
    },

    // === 统计 ===
    renderStats() {
        const data = Store.get();
        const p = data.profile;
        const vm = this.state.viewMonth;
        const year = vm.getFullYear();
        const month = vm.getMonth();
        const unitLabel = p.unit === 'kg' ? 'kg' : '斤';

        let checkinCount = 0;
        let weights = [];
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const rec = data.records[ds];
            if (rec && rec.checked) checkinCount++;
            if (rec && rec.weight != null) weights.push({ date: ds, weight: rec.weight });
        }

        document.getElementById('monthCheckinCount').textContent = checkinCount;

        if (weights.length > 0) {
            const avg = weights.reduce((s, w) => s + w.weight, 0) / weights.length;
            document.getElementById('avgWeight').textContent =
                Store.toDisplay(+avg.toFixed(1), p.unit) + unitLabel;
        } else {
            document.getElementById('avgWeight').textContent = '--';
        }

        if (weights.length >= 2) {
            const first = weights[0].weight;
            const last = weights[weights.length - 1].weight;
            const change = +(last - first).toFixed(1);
            const changeDisplay = Store.toDisplay(Math.abs(change), p.unit);
            const sign = change < 0 ? '-' : change > 0 ? '+' : '';
            document.getElementById('weightChange').textContent =
                `${sign}${changeDisplay}${unitLabel}`;
        } else {
            document.getElementById('weightChange').textContent = '--';
        }

        const streak = getStreak(data.records);
        document.getElementById('currentStreak').textContent = streak;

        const today = todayStr();
        const todayRec = data.records[today];
        const initW = p.initWeight || p.goalWeight;
        const currentW = todayRec && todayRec.weight != null ? todayRec.weight : initW;
        if (initW !== p.goalWeight && currentW !== p.goalWeight) {
            const totalChange = initW - p.goalWeight;
            const doneChange = initW - currentW;
            let progress = Math.min(100, Math.max(0, (doneChange / totalChange) * 100));
            if (initW < p.goalWeight) {
                progress = Math.min(100, Math.max(0, (doneChange / totalChange) * 100));
            }
            progress = Math.round(progress);
            document.getElementById('goalProgressPercent').textContent = progress + '%';
            document.getElementById('progressBarFill').style.width = progress + '%';
        } else {
            document.getElementById('goalProgressPercent').textContent = '0%';
            document.getElementById('progressBarFill').style.width = '0%';
        }
    },

    // === 设置 ===
    openSettings() {
        const data = Store.get();
        const p = data.profile;
        const unitLabel = p.unit === 'kg' ? 'kg' : '斤';

        document.getElementById('nicknameInput').value = p.nickname;
        document.getElementById('goalWeightInput').value = Store.toDisplay(p.goalWeight, p.unit) || '';
        document.getElementById('initWeightInput').value = Store.toDisplay(p.initWeight, p.unit) || '';
        document.getElementById('settingsWeightUnit').textContent = unitLabel;
        document.getElementById('initWeightUnit').textContent = unitLabel;

        // 头像
        this.state.selectedAvatar = p.avatar;
        document.querySelectorAll('.avatar-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.avatar === p.avatar);
        });

        // ===== 调色盘 =====
        // 克隆保存的主题到临时 state
        this.state.theme = Object.assign({}, data.theme);
        // 先渲染列表
        this.renderPaletteGrid();
        // 应用高亮和输入值
        this.state.presetId = findPresetByColors(this.state.theme);
        this.highlightActivePalette();
        this.syncCustomColorInputs();

        document.getElementById('settingsModal').style.display = 'flex';
    },

    saveSettings() {
        const data = Store.get();
        const p = data.profile;

        const nickname = document.getElementById('nicknameInput').value.trim() || '健身小可爱';
        const goalVal = parseFloat(document.getElementById('goalWeightInput').value);
        const initVal = parseFloat(document.getElementById('initWeightInput').value);

        p.nickname = nickname;
        p.avatar = this.state.selectedAvatar;

        if (!isNaN(goalVal) && goalVal > 0) {
            p.goalWeight = Store.toJin(goalVal, p.unit);
        }
        if (!isNaN(initVal) && initVal > 0) {
            p.initWeight = Store.toJin(initVal, p.unit);
        }

        // 保存主题
        if (this.state.theme) {
            data.theme = Object.assign({}, this.state.theme);
        }

        Store.save(data);

        // 应用最终主题（主要是防止因取消逻辑差异造成不同步）
        this.applyStoredTheme();

        showToast('设置已保存 ⚙️');
        this.closeModal('settingsModal');
        this.render();
    },

    closeModal(id) {
        // 如果关闭的是设置弹窗，且用户点击的是遮罩/取消/关闭按钮，则需要恢复存储的主题（预览丢弃）
        if (id === 'settingsModal') {
            this.applyStoredTheme();
        }
        document.getElementById(id).style.display = 'none';
    },
};

// === 启动 ===
document.addEventListener('DOMContentLoaded', () => App.init());
