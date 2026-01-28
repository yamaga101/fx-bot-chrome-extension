// ========================================================================
// FX Bot v17.2.0 - ポップアップ画面ロジック (CHt20011)
// 自動売買メインループ（v17.0 ロジック + v16.5 起動方式）
// ========================================================================

(function () {
    'use strict';

    // ========================================================================
    // 設定 & 定数（初期値）
    // ========================================================================
    const BET_STEPS = [1000, 2000, 4000];
    const MONITOR_MS = 250; // 少し余裕を持たせる

    // 動的設定
    let ORDER_COOLDOWN_MS = { min: 10000, max: 20000 };
    let GLOBAL_ORDER_INTERVAL_MS = { min: 8000, max: 15000 };
    let MAX_SPREAD = { USDJPY: 0.5, EURUSD: 0.5, AUDJPY: 1.0, GBPJPY: 1.5 };

    const SELECTORS = {
        SELL_BTN: 'btn-sell',
        BUY_BTN: 'btn-buy',
        QTY_INPUT: 'amt',
        SPREAD: 'sp',
        SELL_POS_QTY: 'sellPositionAmount',
        BUY_POS_QTY: 'buyPositionAmount',
        PL_YEN_BUY: 'buyUnrealized',
        PL_YEN_SELL: 'sellUnrealized'
    };

    const KEYS = {
        RUNNING: 'fxBot_v16_Run',
        LIVE_LOG: 'fxBot_v16_Log',
    };

    // ========================================================================
    // ユーティリティ
    // ========================================================================
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const Storage = window.FXBotStorage;

    const getNum = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const val = (el.innerText || el.value || '').replace(/,/g, '').trim();
        return val ? parseFloat(val.match(/-?\d+(\.\d+)?/)?.[0] || 0) : null;
    };

    const getDT = () => {
        const d = new Date();
        const pad = n => (n < 10 ? '0' : '') + n;
        return { time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` };
    };

    const liveLog = async (msg) => {
        const str = `[${getDT().time}] ${msg}`;
        console.log(str);
        await Storage.set(KEYS.LIVE_LOG, str);
    };

    const getPairCfg = async (pair, key, def) => await Storage.get(`fxBot_v16_${pair}_${key}`, def);
    const setPairCfg = async (pair, key, val) => await Storage.set(`fxBot_v16_${pair}_${key}`, val);

    const loadDynamicSettings = async () => {
        const { fxBot_settings } = await chrome.storage.local.get('fxBot_settings');
        if (fxBot_settings) {
            if (fxBot_settings.orderCooldown) ORDER_COOLDOWN_MS = fxBot_settings.orderCooldown;
            if (fxBot_settings.globalInterval) GLOBAL_ORDER_INTERVAL_MS = fxBot_settings.globalInterval;
            if (fxBot_settings.maxSpread) MAX_SPREAD = fxBot_settings.maxSpread;
        }
    };

    // ========================================================================
    // 通貨ペア特定（DOM優先判定・リトライ強化）
    // ========================================================================
    const getAssignedPair = async () => {
        for (let attempt = 0; attempt < 8; attempt++) {
            const body = document.body.innerText;
            if (body.includes('米ドル/円') || body.includes('USD/JPY')) return 'USDJPY';
            if (body.includes('ユーロ/ドル') || body.includes('EUR/USD')) return 'EURUSD';
            if (body.includes('豪ドル/円') || body.includes('AUD/JPY')) return 'AUDJPY';
            if (body.includes('ポンド/円') || body.includes('GBP/JPY')) return 'GBPJPY';
            await sleep(1500);
        }
        // フォールバック
        const pending = await Storage.get('fxBot_v16_PendingPairs', []);
        const idx = await Storage.get('fxBot_v16_PairIndex', 0);
        if (idx < pending.length) {
            const pair = pending[idx];
            await Storage.set('fxBot_v16_PairIndex', idx + 1);
            return pair;
        }
        return 'USDJPY';
    };

    const switchPairUI = async (currentPair) => {
        const JP_NAMES = { 'USDJPY': ['ドル/円'], 'EURUSD': ['ユーロ/ドル'], 'AUDJPY': ['豪ドル/円'], 'GBPJPY': ['ポンド/円'] };
        const targets = JP_NAMES[currentPair] || [currentPair];
        const selects = document.querySelectorAll('select');
        let switched = false;
        for (const sel of selects) {
            for (const opt of sel.options) {
                if (targets.some(t => opt.text.includes(t))) {
                    sel.value = opt.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    switched = true; break;
                }
            }
            if (switched) break;
        }
        if (!switched) {
            document.querySelectorAll('a,span,div').forEach(el => {
                if (targets.some(t => el.innerText && el.innerText.includes(t))) el.click();
            });
        }
    };

    // ========================================================================
    // 売買ロジック
    // ========================================================================
    let isOrdering = false;

    const entry = async (currentPair, side, reason) => {
        if (isOrdering) return;

        // 最新設定リロード
        await loadDynamicSettings();

        // 1. スプレッドチェック (EURUSD対応 0.00005 -> 0.5)
        let sp = getNum(SELECTORS.SPREAD);
        const maxSp = MAX_SPREAD[currentPair] || 1.0;
        if (currentPair === 'EURUSD' && sp !== null && sp < 1.0) sp = sp * 10000;

        if (sp !== null && sp > maxSp) return;

        // 2. グローバルロックチェック（即座に判定・設定）
        const now = Date.now();
        const globalLock = await Storage.get('fxBot_v16_GlobalOrderLock', 0);

        let waitMs = 8000;
        if (GLOBAL_ORDER_INTERVAL_MS?.min) {
            waitMs = random(GLOBAL_ORDER_INTERVAL_MS.min, GLOBAL_ORDER_INTERVAL_MS.max);
        }

        if (now - globalLock < waitMs) return;

        // 3. ロック取得
        isOrdering = true;
        await Storage.set('fxBot_v16_GlobalOrderLock', now);

        try {
            await sleep(random(1000, 3000)); // ステルス待機

            const step = await getPairCfg(currentPair, `STEP_${side === 'Buy' ? 'L' : 'S'}`, 1);
            const qty = BET_STEPS[step - 1] || 1000;
            const input = document.getElementById(SELECTORS.QTY_INPUT);
            const btn = document.getElementById(side === 'Buy' ? SELECTORS.BUY_BTN : SELECTORS.SELL_BTN);

            if (input && btn) {
                input.value = qty;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(300);
                btn.click();
                await liveLog(`[${currentPair}] ${side} ${qty} (Step${step}) SP:${sp?.toFixed(1)}`);
                await setPairCfg(currentPair, `LAST_ORDER`, Date.now());
                await sleep(5000); // UI反映待ち
            }
        } catch (e) {
            console.error(e);
        } finally {
            isOrdering = false;
        }
    };

    const judge = async (currentPair, pl, side) => {
        if (pl === 0) return;
        const isWin = pl > 0;
        const keyStep = `STEP_${side === 'Long' ? 'L' : 'S'}`;
        let step = await getPairCfg(currentPair, keyStep, 1);
        if (isWin) {
            step = (step >= BET_STEPS.length) ? 1 : step + 1;
        } else {
            step = 1;
        }
        await setPairCfg(currentPair, keyStep, step);
        await liveLog(`[${currentPair}] ${isWin ? 'Win' : 'Loss'} ${pl.toFixed(1)}円 → Step${step}`);
    };

    // ========================================================================
    // メインループ
    // ========================================================================
    const startMonitor = (currentPair) => {
        setInterval(async () => {
            const running = await Storage.get(KEYS.RUNNING, false);
            if (!running) return;

            const sp = getNum(SELECTORS.SPREAD);
            const qL = getNum(SELECTORS.BUY_POS_QTY) || 0;
            const qS = getNum(SELECTORS.SELL_POS_QTY) || 0;
            const plL = getNum(SELECTORS.PL_YEN_BUY) || 0;
            const plS = getNum(SELECTORS.PL_YEN_SELL) || 0;

            if (sp === null || isOrdering) return;

            // UI更新
            const displaySp = (currentPair === 'EURUSD' && sp < 1.0) ? (sp * 10000) : sp;
            await Storage.set(`fxBot_v16_UI_${currentPair}`, { sp: displaySp.toFixed(1), qL, qS, plL, plS });

            // 決済判定
            const prevL = await getPairCfg(currentPair, 'PREV_QL', 0);
            const prevS = await getPairCfg(currentPair, 'PREV_QS', 0);

            if (prevL > 0 && qL === 0) {
                await judge(currentPair, await getPairCfg(currentPair, 'LAST_PL_L', 0), 'Long');
                await sleep(1000);
            }
            if (prevS > 0 && qS === 0) {
                await judge(currentPair, await getPairCfg(currentPair, 'LAST_PL_S', 0), 'Short');
                await sleep(1000);
            }

            // キャッシュ
            if (qL > 0) await setPairCfg(currentPair, 'LAST_PL_L', plL);
            if (qS > 0) await setPairCfg(currentPair, 'LAST_PL_S', plS);
            await setPairCfg(currentPair, 'PREV_QL', qL);
            await setPairCfg(currentPair, 'PREV_QS', qS);

            // エントリー判定
            if (qL === 0 && qS === 0) {
                await entry(currentPair, 'Buy', 'Init_L');
                await sleep(2500);
                await entry(currentPair, 'Sell', 'Init_S');
            } else if (qL > 0 && qS === 0) {
                await entry(currentPair, 'Sell', 'Hedge_S');
            } else if (qS > 0 && qL === 0) {
                await entry(currentPair, 'Buy', 'Hedge_L');
            }

            // セッション維持
            const closeBtn = document.querySelector('input[value="閉じる"]');
            if (closeBtn) closeBtn.click();

        }, MONITOR_MS);
    };

    // ========================================================================
    // 初期化
    // ========================================================================
    const init = async () => {
        const currentPair = await getAssignedPair();
        await liveLog(`[${currentPair}] Window Active (v17.1.0)`);

        // 位置調整
        const positions = await Storage.get('fxBot_v16_WindowPositions', []);
        const myPos = positions.find(p => p.pair === currentPair);
        if (myPos) {
            window.moveTo(myPos.x, myPos.y);
            window.resizeTo(350, 520);
        }

        await sleep(2000);
        await switchPairUI(currentPair);
        startMonitor(currentPair);
    };

    init();
})();
