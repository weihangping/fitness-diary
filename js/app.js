/* ============================================
   健身打卡 · 可爱健身日记 v2
   数据存储 + 业务逻辑 + UI 渲染 + 主题调色盘
   新增：训练记录、备注、统计维度、体重曲线
   ============================================ */

// ====== 主题预设 ======

const THEME_PRESETS = [
    { id: 'dusty_rose', name: '🌸 皮粉', primary: '#D9BEBE', green: '#B0D2B8', red: '#E0A0A0' },
    { id: 'matcha', name: '🍵 奶绿', primary: '#B8CCC0', green: '#9DC9A8', red: '#D8A89E' },
    { id: 'sky_blue', name: '🌊 浅蓝', primary: '#BEC9D9', green: '#A9D1CF', red: '#D9A8B0' },
    { id: 'lavender', name: '💜 薰衣草', primary: '#C9BEDE', green: '#BEB6D9', red: '#D9A8B5' },
    { id: 'cream_apricot', name: '🍊 奶杏', primary: '#DCC2A8', green: '#C9C69E', red: '#D9A98A' },
    { id: 'peach', name: '🌷 蜜桃', primary: '#E0C4C9', green: '#B5CCBB', red: '#D9A8B1' },
];

// ====== 颜色工具 ======

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) };
}

function rgbToHex({ r, g, b }) {
    const f = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
    return `#${f(r)}${f(g)}${f(b)}`;
}

function mixWithWhite(hex, ratio) {
    const c = hexToRgb(hex);
    return rgbToHex({ r: c.r + (255 - c.r) * ratio, g: c.g + (255 - c.g) * ratio, b: c.b + (255 - c.b) * ratio });
}

function buildThemeVars({ primary, green, red }) {
    const pRgb = hexToRgb(primary);
    const rRgb = hexToRgb(red);
    const orange = rgbToHex({ r: Math.min(255, pRgb.r + 10), g: Math.min(255, pRgb.g + 20), b: Math.max(0, pRgb.b - 10) });
    const purple = rgbToHex({ r: Math.round((pRgb.r + pRgb.b) / 2), g: Math.max(0, pRgb.g - 8), b: Math.min(255, (pRgb.r + pRgb.b) / 2 + 20) });
    return {
        '--pink': primary,
        '--pink-light': mixWithWhite(primary, 0.55),
        '--pink-bg': mixWithWhite(primary, 0.9),
        '--pink-soft': mixWithWhite(primary, 0.75),
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
    const bg0 = mixWithWhite(vars['--pink'], 0.95);
    const bg1 = mixWithWhite(vars['--pink'], 0.9);
    document.body.style.background = `linear-gradient(180deg, ${bg0} 0%, ${bg1} 100%)`;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', vars['--pink']);
}

function findPresetByColors({ primary, green }) {
    const m = THEME_PRESETS.find(p => p.primary.toLowerCase() === primary.toLowerCase() && p.green.toLowerCase() === green.toLowerCase());
    return m ? m.id : null;
}

// ====== 数据层 ======

const Store = {
    KEY: 'fitness_diary_data',

    defaults() {
        const dp = THEME_PRESETS[0];
        return {
            profile: { nickname: '健身小可爱', avatar: '🐱', goalWeight: 100, initWeight: 120, unit: 'jin' },
            theme: { primary: dp.primary, green: dp.green, red: dp.red },
            exerciseNames: [],
            records: {},
        };
    },

    load() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (!raw) { const d = this.defaults(); this.save(d); return d; }
            const parsed = JSON.parse(raw);
            let changed = false;
            // 老数据兼容：补 theme
            if (!parsed.theme) { parsed.theme = this.defaults().theme; changed = true; }
            // v2 兼容：补 exerciseNames
            if (!Array.isArray(parsed.exerciseNames)) { parsed.exerciseNames = []; changed = true; }
            // v2 兼容：每条记录补 exercises / note
            // v3 兼容：训练项旧格式 {name, weight, sets, reps} → 新格式 {name, sets:[{weight,reps}]}
            if (parsed.records) {
                Object.values(parsed.records).forEach(rec => {
                    if (rec && !Array.isArray(rec.exercises)) { rec.exercises = []; changed = true; }
                    if (rec && typeof rec.note !== 'string') { rec.note = ''; changed = true; }
                    if (rec && Array.isArray(rec.exercises)) {
                        let migrated = false;
                        rec.exercises = rec.exercises.map(ex => {
                            if (ex && ex.sets !== undefined && !Array.isArray(ex.sets)) {
                                migrated = true;
                                const oldSets = ex.sets || 1;
                                const w = ex.weight != null ? ex.weight : null;
                                const r = ex.reps != null ? ex.reps : null;
                                const sets = Array.from({ length: Math.max(1, oldSets) }, () => ({ weight: w, reps: r }));
                                return { name: ex.name || '', sets };
                            }
                            return ex;
                        });
                        if (migrated) changed = true;
                    }
                });
            }
            if (changed) this.save(parsed);
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

    update(fn) { const data = this.get(); fn(data); this.save(data); },

    toDisplay(weightJin, unit) {
        if (weightJin == null) return null;
        return unit === 'kg' ? +(weightJin / 2).toFixed(1) : +weightJin.toFixed(1);
    },

    toJin(weightDisplay, unit) {
        if (weightDisplay == null || weightDisplay === '') return null;
        return unit === 'kg' ? +(weightDisplay * 2).toFixed(1) : +weightDisplay.toFixed(1);
    },

    /** 获取最新一条有体重的记录 {date, weight}，没有则 null */
    getLatestWeightRecord(records) {
        const dates = Object.keys(records).filter(d => records[d] && records[d].weight != null).sort();
        if (dates.length === 0) return null;
        const d = dates[dates.length - 1];
        return { date: d, weight: records[d].weight };
    },

    /** 按时间范围筛选有体重的记录（含端点） */
    getWeightRecordsInRange(records, startDate, endDate) {
        return Object.keys(records)
            .filter(d => d >= startDate && d <= endDate && records[d] && records[d].weight != null)
            .sort()
            .map(d => ({ date: d, weight: records[d].weight }));
    },

    /** 按范围统计打卡数 */
    getCheckinCountInRange(records, startDate, endDate) {
        return Object.keys(records)
            .filter(d => d >= startDate && d <= endDate && records[d] && records[d].checked)
            .length;
    },
};

// ====== 工具函数 ======

function todayStr() { return fmtDate(new Date()); }

function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }

/** 从今天往回数的连续打卡天数（支持跨月，补签后实时更新） */
function getStreak(records) {
    let streak = 0;
    const d = new Date();
    // 如果今天还没打卡，从昨天开始算
    const todayKey = fmtDate(d);
    if (!(records[todayKey] && records[todayKey].checked)) {
        d.setDate(d.getDate() - 1);
    }
    while (true) {
        const key = fmtDate(d);
        if (records[key] && records[key].checked) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else break;
    }
    return streak;
}

/** 计算指定维度的统计数据 */
function calcStats(records, dim, viewDate) {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    let start, end, label;
    if (dim === 'month') {
        start = fmtDate(new Date(y, m, 1));
        end = fmtDate(new Date(y, m + 1, 0));
        label = `${y}年${m + 1}月`;
    } else if (dim === 'year') {
        start = fmtDate(new Date(y, 0, 1));
        end = fmtDate(new Date(y, 11, 31));
        label = `${y}年`;
    } else {
        const dates = Object.keys(records).filter(d => records[d]).sort();
        if (dates.length === 0) { start = todayStr(); end = todayStr(); }
        else { start = dates[0]; end = dates[dates.length - 1]; }
        label = '全部';
    }
    const weights = Store.getWeightRecordsInRange(records, start, end);
    const checkinCount = Store.getCheckinCountInRange(records, start, end);
    const avgWeight = weights.length > 0 ? weights.reduce((s, w) => s + w.weight, 0) / weights.length : null;
    const weightChange = weights.length >= 2 ? +(weights[weights.length - 1].weight - weights[0].weight).toFixed(1) : null;
    const streak = getStreak(records);
    return { start, end, label, weights, checkinCount, avgWeight, weightChange, streak };
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.style.display = 'none'; }, 2200);
}

// ====== UI 渲染 ======

const App = {
    state: {
        viewMonth: new Date(),
        selectedDate: null,
        selectedAvatar: '🐱',
        backfillCheckin: false,
        theme: null,
        presetId: null,
        currentPage: 'home',
        statsDim: 'month',
        tempExercises: [],   // 补签弹窗中临时训练项
    },

    init() {
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
        this.applyStoredTheme();
        this.bindEvents();
        this.render();
    },

    // ===== 主题 =====
    applyStoredTheme() { applyThemeVars(buildThemeVars(Store.get().theme)); },

    applyTempTheme() {
        const t = this.state.theme;
        if (!t) return;
        applyThemeVars(buildThemeVars(t));
        this.state.presetId = findPresetByColors(t);
        this.highlightActivePalette();
        this.syncCustomColorInputs();
    },

    renderPaletteGrid() {
        const grid = document.getElementById('paletteGrid');
        const activeId = this.state.presetId;
        grid.innerHTML = THEME_PRESETS.map(p => {
            const vars = buildThemeVars({ primary: p.primary, green: p.green, red: p.red });
            const sw = [vars['--pink'], vars['--green-light'], vars['--pink-bg']];
            const sh = sw.map(c => `<span class="palette-swatch" style="background:${c}"></span>`).join('');
            const ac = p.id === activeId ? ' active' : '';
            return `<div class="palette-item${ac}" data-preset="${p.id}"><div class="palette-preview">${sh}</div><div class="palette-name">${p.name}</div></div>`;
        }).join('');
        grid.querySelectorAll('.palette-item').forEach(el => {
            el.addEventListener('click', () => {
                const p = THEME_PRESETS.find(x => x.id === el.dataset.preset);
                if (!p) return;
                this.state.theme = { primary: p.primary, green: p.green, red: p.red };
                this.applyTempTheme();
            });
        });
    },

    highlightActivePalette() {
        const id = this.state.presetId;
        document.querySelectorAll('.palette-item').forEach(el => el.classList.toggle('active', el.dataset.preset === id));
    },

    syncCustomColorInputs() {
        const t = this.state.theme;
        if (!t) return;
        const pi = document.getElementById('customPrimary');
        const gi = document.getElementById('customGreen');
        if (pi && pi.value.toLowerCase() !== t.primary.toLowerCase()) pi.value = t.primary;
        if (gi && gi.value.toLowerCase() !== t.green.toLowerCase()) gi.value = t.green;
    },

    // ===== 事件绑定 =====
    bindEvents() {
        document.getElementById('checkinBtn').addEventListener('click', () => this.toggleCheckin());
        document.getElementById('addTodayTraining').addEventListener('click', () => this.openBackfill(todayStr()));

        document.getElementById('saveWeightBtn').addEventListener('click', () => this.saveTodayWeight());
        document.getElementById('weightInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.saveTodayWeight(); });

        document.querySelectorAll('.unit-btn').forEach(btn => btn.addEventListener('click', () => this.switchUnit(btn.dataset.unit)));

        document.getElementById('prevMonth').addEventListener('click', () => this.changeMonth(-1));
        document.getElementById('nextMonth').addEventListener('click', () => this.changeMonth(1));

        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        document.getElementById('settingsClose').addEventListener('click', () => this.closeModal('settingsModal'));
        document.getElementById('settingsCancel').addEventListener('click', () => this.closeModal('settingsModal'));
        document.getElementById('settingsSave').addEventListener('click', () => this.saveSettings());

        document.querySelectorAll('.avatar-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                this.state.selectedAvatar = opt.dataset.avatar;
            });
        });

        document.getElementById('customPrimary').addEventListener('input', e => {
            if (!this.state.theme) return;
            this.state.theme.primary = e.target.value;
            const p = hexToRgb(e.target.value);
            this.state.theme.red = rgbToHex({ r: Math.min(255, p.r + 10), g: Math.max(0, p.g - 10), b: Math.max(0, p.b - 10) });
            this.applyTempTheme();
        });
        document.getElementById('customGreen').addEventListener('input', e => {
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
        document.getElementById('addExerciseBtn').addEventListener('click', () => this.addExerciseItem());

        // 新增项目弹窗
        document.getElementById('newExerciseClose').addEventListener('click', () => this.closeModal('newExerciseModal'));
        document.getElementById('newExerciseCancel').addEventListener('click', () => this.closeModal('newExerciseModal'));
        document.getElementById('newExerciseSave').addEventListener('click', () => this.saveNewExercise());

        // 统计维度切换
        document.querySelectorAll('#statsDimTabs .dim-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#statsDimTabs .dim-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.statsDim = btn.dataset.dim;
                this.renderStats();
            });
        });

        // 底部导航
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                if (page === 'settings') { this.openSettings(); return; }
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.switchPage(page);
            });
        });

        // 遮罩关闭
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
        });

        // 图表悬浮
        const cv = document.getElementById('weightChartCanvas');
        cv.addEventListener('mousemove', e => this.handleChartHover(e));
        cv.addEventListener('touchmove', e => { e.preventDefault(); this.handleChartHover(e.touches[0]); }, { passive: false });
        cv.addEventListener('mouseleave', () => this.hideChartTooltip());

        // 窗口尺寸变化时重绘图表（移动端横竖屏切换）
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (this.state.currentPage === 'stats') this.drawWeightChart();
            }, 150);
        });
    },

    switchPage(page) {
        this.state.currentPage = page;
        document.getElementById('pageHome').style.display = page === 'home' ? '' : 'none';
        document.getElementById('pageStats').style.display = page === 'stats' ? '' : 'none';
        if (page === 'stats') {
            this.renderStats();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    render() {
        this.renderHeader();
        this.renderCheckin();
        this.renderWeightCard();
        this.renderCalendar();
        this.renderHomeStats();
        if (this.state.currentPage === 'stats') {
            this.renderStats();
        }
    },

    renderHeader() {
        const p = Store.get().profile;
        const ul = p.unit === 'kg' ? 'kg' : '斤';
        document.getElementById('avatar').textContent = p.avatar;
        document.getElementById('nickname').textContent = p.nickname;
        document.getElementById('goalWeightDisplay').textContent = `${Store.toDisplay(p.goalWeight, p.unit)}${ul}`;
    },

    renderCheckin() {
        const data = Store.get();
        const today = todayStr();
        const checked = data.records[today] && data.records[today].checked;
        const streak = getStreak(data.records);
        const d = new Date();
        const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        document.getElementById('todayDate').textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${wd[d.getDay()]}`;
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
        if (!data.records[today]) data.records[today] = { checked: false, weight: null, exercises: [], note: '' };
        data.records[today].checked = !data.records[today].checked;
        Store.save(data);
        showToast(data.records[today].checked ? '打卡成功！🎉' : '已取消今日打卡');
        this.render();
    },

    renderWeightCard() {
        const data = Store.get();
        const p = data.profile;
        const ul = p.unit === 'kg' ? 'kg' : '斤';
        document.getElementById('weightUnitLabel').textContent = ul;
        document.querySelectorAll('.unit-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.unit === p.unit));
        const today = todayStr();
        const tr = data.records[today];
        if (tr && tr.weight != null) document.getElementById('weightInput').value = Store.toDisplay(tr.weight, p.unit);

        const comp = document.getElementById('weightComparison');
        const y = new Date(); y.setDate(y.getDate() - 1);
        const yRec = data.records[fmtDate(y)];
        if (tr && tr.weight != null && yRec && yRec.weight != null) {
            const diff = +(tr.weight - yRec.weight).toFixed(1);
            const d = Store.toDisplay(Math.abs(diff), p.unit);
            if (diff < 0) comp.innerHTML = `<span class="comparison-icon">📉</span> 比昨天 <span class="down">↓${d}${ul}</span> 继续保持！`;
            else if (diff > 0) comp.innerHTML = `<span class="comparison-icon">📈</span> 比昨天 <span class="up">↑${d}${ul}</span> 加油加油~`;
            else comp.innerHTML = `<span class="comparison-icon">➡️</span> 和昨天一样，保持住！`;
        } else if (tr && tr.weight != null) {
            comp.innerHTML = `<span class="comparison-icon">✅</span> 今日已记录 ${Store.toDisplay(tr.weight, p.unit)}${ul}`;
        } else {
            comp.innerHTML = `<span class="comparison-icon">📊</span> 快记录今天的体重吧~`;
        }
    },

    saveTodayWeight() {
        const v = parseFloat(document.getElementById('weightInput').value);
        if (isNaN(v) || v <= 0) { showToast('请输入有效体重'); return; }
        const data = Store.get();
        const p = data.profile;
        const today = todayStr();
        if (!data.records[today]) data.records[today] = { checked: false, weight: null, exercises: [], note: '' };
        data.records[today].weight = Store.toJin(v, p.unit);
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

    renderCalendar() {
        const data = Store.get();
        const p = data.profile;
        const vm = this.state.viewMonth;
        const year = vm.getFullYear(), month = vm.getMonth();
        document.getElementById('calendarTitle').textContent = `${year}年${month + 1}月`;
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = todayStr();
        const ul = p.unit === 'kg' ? 'kg' : '斤';

        let html = '';
        for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
        for (let d = 1; d <= daysInMonth; d++) {
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const rec = data.records[ds];
            const cls = ['cal-day'];
            if (ds === today) cls.push('today');
            if (rec && rec.checked) cls.push('checked');
            if (rec && rec.weight != null) cls.push('has-weight');
            if (rec && rec.exercises && rec.exercises.length > 0) cls.push('has-train');
            let wh = '';
            if (rec && rec.weight != null) wh = `<span class="day-weight">${Store.toDisplay(rec.weight, p.unit)}</span>`;
            html += `<div class="${cls.join(' ')}" data-date="${ds}"><span class="day-num">${d}</span>${wh}</div>`;
        }
        document.getElementById('calendarGrid').innerHTML = html;
        document.querySelectorAll('.cal-day:not(.empty)').forEach(el => el.addEventListener('click', () => this.openBackfill(el.dataset.date)));
    },

    changeMonth(delta) {
        this.state.viewMonth.setMonth(this.state.viewMonth.getMonth() + delta);
        this.renderCalendar();
        this.renderHomeStats(); // 首页统计跟随日历
    },

    // ===== 首页统计（跟随日历当月） =====
    renderHomeStats() {
        const data = Store.get();
        const p = data.profile;
        const s = calcStats(data.records, 'month', this.state.viewMonth);
        const ul = p.unit === 'kg' ? 'kg' : '斤';

        const vm = this.state.viewMonth;
        document.getElementById('homeStatsTitle').textContent = `📊 ${vm.getFullYear()}年${vm.getMonth() + 1}月统计`;
        document.getElementById('homeCheckinCount').textContent = s.checkinCount;
        document.getElementById('homeAvgWeight').textContent = s.avgWeight != null ? Store.toDisplay(+s.avgWeight.toFixed(1), p.unit) + ul : '--';
        if (s.weightChange != null) {
            const cd = Store.toDisplay(Math.abs(s.weightChange), p.unit);
            const sign = s.weightChange < 0 ? '-' : s.weightChange > 0 ? '+' : '';
            document.getElementById('homeWeightChange').textContent = `${sign}${cd}${ul}`;
        } else document.getElementById('homeWeightChange').textContent = '--';
        document.getElementById('homeStreak').textContent = s.streak;

        this.renderGoalProgress(data, p, ul);
    },

    // 总进度：用最新一条体重记录
    renderGoalProgress(data, p, ul) {
        const latest = Store.getLatestWeightRecord(data.records);
        const initW = p.initWeight || p.goalWeight;
        const currentW = latest ? latest.weight : initW;
        let progress = 0;
        if (initW !== p.goalWeight) {
            const total = Math.abs(initW - p.goalWeight);
            const done = Math.abs(initW - currentW);
            // 仅当 currentW 朝目标方向前进时才显示进度
            const movingTowards = (initW > p.goalWeight) ? currentW <= initW : currentW >= initW;
            progress = movingTowards ? Math.min(100, (done / total) * 100) : 0;
        }
        progress = Math.round(progress);
        document.getElementById('goalProgressPercent').textContent = progress + '%';
        document.getElementById('progressBarFill').style.width = progress + '%';
        // 统计页也同步
        const p2 = document.getElementById('goalProgressPercent2');
        if (p2) { p2.textContent = progress + '%'; document.getElementById('progressBarFill2').style.width = progress + '%'; }
    },

    // ===== 统计页 =====
    renderStats() {
        const data = Store.get();
        const p = data.profile;
        const s = calcStats(data.records, this.state.statsDim, this.state.viewMonth);
        const ul = p.unit === 'kg' ? 'kg' : '斤';

        document.getElementById('chartTitle').textContent = `📈 体重曲线 · ${s.label}`;
        document.getElementById('statsCheckinCount').textContent = s.checkinCount;
        document.getElementById('statsAvgWeight').textContent = s.avgWeight != null ? Store.toDisplay(+s.avgWeight.toFixed(1), p.unit) + ul : '--';
        if (s.weightChange != null) {
            const cd = Store.toDisplay(Math.abs(s.weightChange), p.unit);
            const sign = s.weightChange < 0 ? '-' : s.weightChange > 0 ? '+' : '';
            document.getElementById('statsWeightChange').textContent = `${sign}${cd}${ul}`;
        } else document.getElementById('statsWeightChange').textContent = '--';
        document.getElementById('statsStreak').textContent = s.streak;

        this.renderGoalProgress(data, p, ul);
        this.drawWeightChart();
    },

    // ===== 体重曲线 Canvas =====
    drawWeightChart() {
        const data = Store.get();
        const p = data.profile;
        const s = calcStats(data.records, this.state.statsDim, this.state.viewMonth);
        const cv = document.getElementById('weightChartCanvas');
        if (!cv) return;

        // 页面刚切换时 canvas 可能尚未布局（clientWidth=0），等下一帧再画
        const W = cv.clientWidth;
        if (!W || W < 10) {
            requestAnimationFrame(() => this.drawWeightChart());
            return;
        }

        const ctx = cv.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const H = 240;
        cv.width = W * dpr; cv.height = H * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, W, H);

        const weights = s.weights;
        if (weights.length === 0) {
            ctx.fillStyle = '#B0A6A6';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('暂无体重数据', W / 2, H / 2);
            this._chartPoints = [];
            return;
        }

        const primary = getComputedStyle(document.documentElement).getPropertyValue('--pink').trim() || '#D9BEBE';
        const gridColor = '#EEE5E5';
        const textColor = '#8A8080';

        const pad = { l: 40, r: 14, t: 16, b: 26 };
        const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
        const ws = weights.map(w => w.weight);
        const min = Math.floor(Math.min(...ws) - 1);
        const max = Math.ceil(Math.max(...ws) + 1);
        const range = Math.max(1, max - min);
        const unitSuffix = p.unit === 'kg' ? 'kg' : '斤';

        // 网格 + Y 轴
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (let i = 0; i <= 4; i++) {
            const y = pad.t + ih * i / 4;
            const val = max - range * i / 4;
            ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
            ctx.fillStyle = textColor;
            ctx.fillText(Store.toDisplay(+val.toFixed(1), p.unit) + unitSuffix, pad.l - 6, y);
        }

        // X 轴标签
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const labels = weights.map(w => {
            const [y, m, d] = w.date.split('-').map(Number);
            if (this.state.statsDim === 'month') return `${m}/${d}`;
            if (this.state.statsDim === 'year') return `${m}月`;
            return `${y}/${m}`;
        });
        const step = Math.max(1, Math.floor(weights.length / 6));
        labels.forEach((lab, i) => {
            if (i % step === 0 || i === weights.length - 1) {
                const x = pad.l + iw * i / (weights.length - 1 || 1);
                ctx.fillStyle = textColor;
                ctx.fillText(lab, x, H - pad.b + 6);
            }
        });

        // 数据点坐标
        const pts = weights.map((w, i) => ({
            x: pad.l + iw * i / (weights.length - 1 || 1),
            y: pad.t + ih * (max - w.weight) / range,
            data: w,
        }));
        this._chartPoints = pts;

        // 渐变填充
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
        grad.addColorStop(0, mixWithWhite(primary, 0.6) + 'AA');
        grad.addColorStop(1, mixWithWhite(primary, 0.9) + '00');
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pad.t + ih);
        pts.forEach(p2 => ctx.lineTo(p2.x, p2.y));
        ctx.lineTo(pts[pts.length - 1].x, pad.t + ih);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // 折线
        ctx.beginPath();
        pts.forEach((p2, i) => i === 0 ? ctx.moveTo(p2.x, p2.y) : ctx.lineTo(p2.x, p2.y));
        ctx.strokeStyle = primary;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // 点
        pts.forEach(p2 => {
            ctx.beginPath();
            ctx.arc(p2.x, p2.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = primary;
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    },

    handleChartHover(e) {
        const pts = this._chartPoints;
        if (!pts || pts.length === 0) return;
        const cv = document.getElementById('weightChartCanvas');
        const rect = cv.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        // 找最近的点
        let nearest = null, minDist = Infinity;
        pts.forEach(p => {
            const dx = p.x - x, dy = p.y - y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) { minDist = d; nearest = p; }
        });
        const tooltip = document.getElementById('chartTooltip');
        if (nearest && minDist < 30) {
            const p = Store.get().profile;
            const ul = p.unit === 'kg' ? 'kg' : '斤';
            tooltip.innerHTML = `<strong>${nearest.data.date}</strong><br>体重：${Store.toDisplay(nearest.data.weight, p.unit)}${ul}`;
            tooltip.style.display = 'block';
            tooltip.style.left = Math.min(nearest.x + 8, cv.clientWidth - 100) + 'px';
            tooltip.style.top = Math.max(nearest.y - 40, 0) + 'px';
        } else {
            this.hideChartTooltip();
        }
    },

    hideChartTooltip() {
        const t = document.getElementById('chartTooltip');
        if (t) t.style.display = 'none';
    },

    // ===== 补签 / 训练 =====
    openBackfill(dateStr) {
        const data = Store.get();
        const p = data.profile;
        const rec = data.records[dateStr] || {};
        this.state.selectedDate = dateStr;

        const d = parseDate(dateStr);
        document.getElementById('backfillDateTitle').textContent = `${d.getMonth() + 1}月${d.getDate()}日 记录`;
        const ul = p.unit === 'kg' ? 'kg' : '斤';
        document.getElementById('modalWeightUnit').textContent = ul;

        document.getElementById('backfillWeight').value = rec.weight != null ? Store.toDisplay(rec.weight, p.unit) : '';
        document.getElementById('backfillNote').value = rec.note || '';

        this.state.backfillCheckin = rec.checked || false;
        this.updateBackfillToggle();

        // 训练项（深拷贝 sets，避免直接修改原记录）
        this.state.tempExercises = (rec.exercises || []).map(e => ({
            name: e.name || '',
            sets: (e.sets || []).map(s => ({ weight: s.weight != null ? s.weight : null, reps: s.reps != null ? s.reps : null })),
        }));
        this.renderExerciseList();

        // 删除按钮
        document.getElementById('backfillDelete').style.display =
            (rec.checked || rec.weight != null || (rec.exercises && rec.exercises.length > 0) || rec.note) ? 'block' : 'none';

        document.getElementById('backfillModal').style.display = 'flex';
    },

    renderExerciseList() {
        const data = Store.get();
        const names = data.exerciseNames || [];
        const list = document.getElementById('exerciseList');
        const items = this.state.tempExercises;
        if (items.length === 0) {
            list.innerHTML = '<div class="exercise-empty">暂无训练项，点击下方添加</div>';
            return;
        }

        list.innerHTML = items.map((ex, i) => {
            const sets = ex.sets || [];
            const setsHtml = sets.map((s, j) => `
                <div class="ex-set-row">
                    <span class="set-badge">组${j + 1}</span>
                    <input type="number" class="set-weight" data-i="${i}" data-j="${j}" value="${s.weight != null ? s.weight : ''}" step="0.5" placeholder="kg">
                    <span class="set-x">×</span>
                    <input type="number" class="set-reps" data-i="${i}" data-j="${j}" value="${s.reps != null ? s.reps : ''}" placeholder="次">
                    <button class="set-remove-btn" data-i="${i}" data-j="${j}" title="删除本组">✕</button>
                </div>
            `).join('');
            // 已有项目下拉（选择后自动填入上方输入框）
            const opts = names.map(n => `<option value="${n}">${n}</option>`).join('');
            const picker = names.length > 0 ? `
                <select class="ex-name-picker" data-i="${i}">
                    <option value="">选择已有项目…</option>
                    ${opts}
                </select>` : '';
            return `<div class="exercise-item">
                <div class="ex-name-row">
                    <input type="text" class="ex-name-input" data-i="${i}" placeholder="项目名（可直接输入新名称）" value="${ex.name || ''}">
                    <button class="ex-remove-btn" data-i="${i}" title="删除该项目">✕</button>
                </div>
                ${picker}
                <div class="ex-sets-list">${setsHtml}</div>
                <button class="add-set-btn" data-i="${i}">+ 添加一组</button>
            </div>`;
        }).join('');

        // 项目名输入
        list.querySelectorAll('.ex-name-input').forEach(inp => {
            inp.addEventListener('input', () => { this.state.tempExercises[+inp.dataset.i].name = inp.value; });
        });
        // 从下拉选择已有项目 → 填入输入框
        list.querySelectorAll('.ex-name-picker').forEach(sel => {
            sel.addEventListener('change', () => {
                const i = +sel.dataset.i;
                const inp = list.querySelector(`.ex-name-input[data-i="${i}"]`);
                if (sel.value) {
                    inp.value = sel.value;
                    this.state.tempExercises[i].name = sel.value;
                    sel.value = ''; // 重置，方便再次选择
                }
            });
        });
        // 每组重量
        list.querySelectorAll('.set-weight').forEach(inp => inp.addEventListener('input', () => {
            const v = inp.value;
            this.state.tempExercises[+inp.dataset.i].sets[+inp.dataset.j].weight = v === '' ? null : parseFloat(v);
        }));
        // 每组次数
        list.querySelectorAll('.set-reps').forEach(inp => inp.addEventListener('input', () => {
            const v = inp.value;
            this.state.tempExercises[+inp.dataset.i].sets[+inp.dataset.j].reps = v === '' ? null : parseInt(v);
        }));
        // 删除某组
        list.querySelectorAll('.set-remove-btn').forEach(btn => btn.addEventListener('click', () => {
            const i = +btn.dataset.i, j = +btn.dataset.j;
            this.state.tempExercises[i].sets.splice(j, 1);
            this.renderExerciseList();
        }));
        // 添加一组
        list.querySelectorAll('.add-set-btn').forEach(btn => btn.addEventListener('click', () => {
            this.state.tempExercises[+btn.dataset.i].sets.push({ weight: null, reps: null });
            this.renderExerciseList();
        }));
        // 删除整个项目
        list.querySelectorAll('.ex-remove-btn').forEach(btn => btn.addEventListener('click', () => {
            this.state.tempExercises.splice(+btn.dataset.i, 1);
            this.renderExerciseList();
        }));
    },

    addExerciseItem() {
        this.state.tempExercises.push({ name: '', sets: [{ weight: null, reps: null }] });
        this.renderExerciseList();
    },

    toggleBackfillCheckin() {
        this.state.backfillCheckin = !this.state.backfillCheckin;
        this.updateBackfillToggle();
    },

    updateBackfillToggle() {
        const t = document.getElementById('backfillCheckinToggle');
        if (this.state.backfillCheckin) { t.classList.add('active'); t.textContent = '已打卡 ✓'; }
        else { t.classList.remove('active'); t.textContent = '未打卡'; }
    },

    saveBackfill() {
        const dateStr = this.state.selectedDate;
        if (!dateStr) return;
        const data = Store.get();
        const p = data.profile;
        if (!data.records[dateStr]) data.records[dateStr] = { checked: false, weight: null, exercises: [], note: '' };

        const wv = parseFloat(document.getElementById('backfillWeight').value);
        if (!isNaN(wv) && wv > 0) data.records[dateStr].weight = Store.toJin(wv, p.unit);
        else delete data.records[dateStr].weight;

        data.records[dateStr].checked = this.state.backfillCheckin;

        // 训练项：过滤没有项目名的；每组过滤掉重量和次数都为空的
        const validEx = this.state.tempExercises
            .filter(e => e.name && e.name.trim())
            .map(e => ({
                name: e.name.trim(),
                sets: (e.sets || []).filter(s => s.weight != null || s.reps != null),
            }));
        data.records[dateStr].exercises = validEx;
        // 把新项目名加入常用库
        validEx.forEach(e => {
            if (e.name && !data.exerciseNames.includes(e.name)) data.exerciseNames.push(e.name);
        });

        data.records[dateStr].note = document.getElementById('backfillNote').value.trim();

        const rec = data.records[dateStr];
        if (!rec.checked && rec.weight == null && (!rec.exercises || rec.exercises.length === 0) && !rec.note) {
            delete data.records[dateStr];
        }

        Store.save(data);
        showToast('保存成功 📝');
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

    // ===== 新增训练项目 =====
    saveNewExercise() {
        const name = document.getElementById('newExerciseName').value.trim();
        if (!name) { showToast('请输入项目名称'); return; }
        const data = Store.get();
        if (data.exerciseNames.includes(name)) { showToast('该项目已存在'); return; }
        data.exerciseNames.push(name);
        Store.save(data);
        document.getElementById('newExerciseName').value = '';
        this.closeModal('newExerciseModal');
        // 重新渲染训练列表并新增一项
        this.state.tempExercises.push({ name, sets: [{ weight: null, reps: null }] });
        this.renderExerciseList();
        showToast(`已添加项目：${name}`);
    },

    // ===== 设置 =====
    openSettings() {
        const data = Store.get();
        const p = data.profile;
        const ul = p.unit === 'kg' ? 'kg' : '斤';
        document.getElementById('nicknameInput').value = p.nickname;
        document.getElementById('goalWeightInput').value = Store.toDisplay(p.goalWeight, p.unit) || '';
        document.getElementById('initWeightInput').value = Store.toDisplay(p.initWeight, p.unit) || '';
        document.getElementById('settingsWeightUnit').textContent = ul;
        document.getElementById('initWeightUnit').textContent = ul;
        this.state.selectedAvatar = p.avatar;
        document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.toggle('active', opt.dataset.avatar === p.avatar));
        this.state.theme = Object.assign({}, data.theme);
        this.renderPaletteGrid();
        this.state.presetId = findPresetByColors(this.state.theme);
        this.highlightActivePalette();
        this.syncCustomColorInputs();
        document.getElementById('settingsModal').style.display = 'flex';
    },

    saveSettings() {
        const data = Store.get();
        const p = data.profile;
        p.nickname = document.getElementById('nicknameInput').value.trim() || '健身小可爱';
        p.avatar = this.state.selectedAvatar;
        const gv = parseFloat(document.getElementById('goalWeightInput').value);
        const iv = parseFloat(document.getElementById('initWeightInput').value);
        if (!isNaN(gv) && gv > 0) p.goalWeight = Store.toJin(gv, p.unit);
        if (!isNaN(iv) && iv > 0) p.initWeight = Store.toJin(iv, p.unit);
        if (this.state.theme) data.theme = Object.assign({}, this.state.theme);
        Store.save(data);
        this.applyStoredTheme();
        showToast('设置已保存 ⚙️');
        this.closeModal('settingsModal');
        this.render();
    },

    closeModal(id) {
        if (id === 'settingsModal') this.applyStoredTheme();
        document.getElementById(id).style.display = 'none';
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
