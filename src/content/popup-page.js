// ========================================================================
// FX Bot v16.2 - ポップアップ画面ロジック (CHt20011)
// 自動売買メインループ
// ========================================================================

(function () {
    'use strict';

    // ========================================================================
    // 設定 & 定数
    // ========================================================================
    const BET_STEPS = [1000, 2000, 4000];
    const MONITOR_MS = 200;
    const ORDER_COOLDOWN_MS = 10000;

    const CURRENCY_PAIRS = {
        USDJPY: { code: 'USDJPY', name: 'USD/JPY' },
        EURUSD: { code: 'EURUSD', name: 'EUR/USD' },
        AUDJPY: { code: 'AUDJPY', name: 'AUD/JPY' },
        GBPJPY: { code: 'GBPJPY', name: 'GBP/JPY' }
    };

    const SELECTORS = {
        SELL_BTN: 'btn-sell',
        BUY_BTN: 'btn-buy',
        QTY_INPUT: 'amt',
        SPREAD: 'sp',
        SELL_POS_QTY: 'sellPositionAmount',
        BUY_POS_QTY: 'buyPositionAmount',
        PL_YEN_BUY: 'buyUnrealized',
        PL_YEN_SELL: 'sellUnrealized',
        BID_RATE: 'btn-sell',
        ASK_RATE: 'btn-buy',
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

    const getRate = (id) => {
        const el = document.getElementById(id);
        return el ? parseFloat((el.innerText || '').replace(/,/g, '').match(/\d+\.\d+/)?.[0] || 0) : null;
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

    // ペア固有の設定取得/保存
    const getPairCfg = async (pair, key, def) => await Storage.get(`fxBot_v16_${pair}_${key}`, def);
    const setPairCfg = async (pair, key, val) => await Storage.set(`fxBot_v16_${pair}_${key}`, val);

    // ========================================================================
    // 通貨ペア特定
    // ========================================================================
    const getAssignedPair = async () => {
        const pending = await Storage.get('fxBot_v16_PendingPairs', []);
        const idx = await Storage.get('fxBot_v16_PairIndex', 0);
        if (idx < pending.length) {
            const pair = pending[idx];
            await Storage.set('fxBot_v16_PairIndex', idx + 1);
            return pair;
        }
        // フォールバック: 画面テキストから判定
        const body = document.body.innerText;
        if (body.includes('米ドル/円') || body.includes('USD/JPY')) return 'USDJPY';
        if (body.includes('ユーロ/ドル') || body.includes('EUR/USD')) return 'EURUSD';
        if (body.includes('豪ドル/円') || body.includes('AUD/JPY')) return 'AUDJPY';
        if (body.includes('ポンド/円') || body.includes('GBP/JPY')) return 'GBPJPY';
        return 'USDJPY';
    };

    // ========================================================================
    // 通貨ペアUI切替
    // ========================================================================
    const switchPairUI = async (currentPair) => {
        const JP_NAMES = {
            'USDJPY': ['ドル/円'],
            'EURUSD': ['ユーロ/ドル'],
            'AUDJPY': ['豪ドル/円'],
            'GBPJPY': ['ポンド/円']
        };
        const targets = JP_NAMES[currentPair] || [currentPair];

        const selects = document.querySelectorAll('select');
        let switched = false;
        for (const sel of selects) {
            for (const opt of sel.options) {
                if (targets.some(t => opt.text.includes(t))) {
                    sel.value = opt.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    switched = true;
                    break;
                }
            }
            if (switched) break;
        }
        if (!switched) {
            document.querySelectorAll('a,span,div').forEach(el => {
                if (targets.some(t => el.innerText.includes(t))) el.click();
            });
        }
    };

    // ========================================================================
    // 売買ロジック
    // ========================================================================
    let isOrdering = false;

    const entry = async (currentPair, side, reason) => {
        if (isOrdering) return;

        // クールダウンチェック
        const lastOrder = await getPairCfg(currentPair, 'LAST_ORDER', 0);
        const now = Date.now();
        if (now - lastOrder < ORDER_COOLDOWN_MS) {
            console.log(`[${currentPair}] Skip: Cooldown`);
            return;
        }

        isOrdering = true;
        try {
            // ランダム遅延（隠密）
            const stMin = 1.0, stMax = 3.0;
            await sleep(random(stMin * 1000, stMax * 1000));

            const step = await getPairCfg(currentPair, `STEP_${side === 'Buy' ? 'L' : 'S'}`, 1);
            const qty = BET_STEPS[step - 1] || 1000;

            const input = document.getElementById(SELECTORS.QTY_INPUT);
            const btn = document.getElementById(side === 'Buy' ? SELECTORS.BUY_BTN : SELECTORS.SELL_BTN);

            if (input && btn) {
                input.value = qty;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(200);

                btn.click();
                await liveLog(`[${currentPair}] ${side} ${qty} (Step${step})`);

                // タイムスタンプ更新
                await setPairCfg(currentPair, `LAST_ORDER`, Date.now());

                // UI反映待ち
                await sleep(5000);
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
        await liveLog(`[${currentPair}] ${isWin ? 'Win' : 'Loss'} ${pl}円 → Step${step}`);
    };

    // ========================================================================
    // メインループ
    // ========================================================================
    const startMonitor = (currentPair) => {
        setInterval(async () => {
            const sp = getNum(SELECTORS.SPREAD);
            const qL = getNum(SELECTORS.BUY_POS_QTY) || 0;
            const qS = getNum(SELECTORS.SELL_POS_QTY) || 0;
            const plL = getNum(SELECTORS.PL_YEN_BUY) || 0;
            const plS = getNum(SELECTORS.PL_YEN_SELL) || 0;

            // UI更新用データ保存
            if (sp !== null) {
                await Storage.set(`fxBot_v16_UI_${currentPair}`, { sp, qL, qS, plL, plS });
            }

            // 実行判定
            const running = await Storage.get(KEYS.RUNNING, false);
            if (!running) return;
            if (sp === null) return;
            if (isOrdering) return;

            // 決済判定
            const prevL = await getPairCfg(currentPair, 'PREV_QL', 0);
            const prevS = await getPairCfg(currentPair, 'PREV_QS', 0);

            if (prevL > 0 && qL === 0) await judge(currentPair, await getPairCfg(currentPair, 'LAST_PL_L', 0), 'Long');
            if (prevS > 0 && qS === 0) await judge(currentPair, await getPairCfg(currentPair, 'LAST_PL_S', 0), 'Short');

            // 状態更新
            if (qL > 0) await setPairCfg(currentPair, 'LAST_PL_L', plL);
            if (qS > 0) await setPairCfg(currentPair, 'LAST_PL_S', plS);
            await setPairCfg(currentPair, 'PREV_QL', qL);
            await setPairCfg(currentPair, 'PREV_QS', qS);

            // クールダウンチェック
            const lastOrder = await getPairCfg(currentPair, 'LAST_ORDER', 0);
            if (Date.now() - lastOrder < ORDER_COOLDOWN_MS) return;

            // 新規エントリー判定
            if (qL === 0 && qS === 0) {
                await entry(currentPair, 'Buy', 'Init_L');
                await sleep(2000);
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
        await liveLog(`[${currentPair}] Window Ready`);

        // ウィンドウ位置調整
        const positions = await Storage.get('fxBot_v16_WindowPositions', []);
        const myPos = positions.find(p => p.pair === currentPair);
        if (myPos) {
            window.moveTo(myPos.x, myPos.y);
            window.resizeTo(350, 500);
        }

        // 通貨ペア切替
        await sleep(2000);
        await switchPairUI(currentPair);

        // メインループ開始
        startMonitor(currentPair);
    };

    init();
})();
