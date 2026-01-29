// ========================================================================
// FX Bot v17.4 - ポップアップ画面ロジック
// 自動売買メインループ（パネル表示改善・エントリー条件設定対応）
// ========================================================================

(function () {
    'use strict';

    // ========================================================================
    // 設定 & 定数（初期値）
    // ========================================================================
    const BET_STEPS = [1000, 2000, 4000];
    const MONITOR_MS = 250; // 少し余裕を持たせる

    // 動的設定
    // 動的設定
    let ORDER_COOLDOWN_MS = { min: 10000, max: 20000 };
    let GLOBAL_ORDER_INTERVAL_MS = { min: 8000, max: 15000 };
    // 初期値も最新のデフォルトに合わせる (EURUSDは内部値3000)
    let MAX_SPREAD = { USDJPY: 0.2, EURUSD: 3000.0, AUDJPY: 0.5, GBPJPY: 0.9 };

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
            console.log('[FXBot] Settings Loaded:', MAX_SPREAD);
        }
    };

    // 設定変更をリアルタイム検知
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.fxBot_settings) {
            console.log('[FXBot] Settings Changed. Reloading...');
            loadDynamicSettings();
        }
    });

    // ========================================================================
    // 通貨ペア特定（PairIndex優先でウィンドウ配置を確実に）
    // ========================================================================
    const getAssignedPair = async () => {
        // 1. まずPairIndexを使って順番に割り当て（ウィンドウ配置のため）
        const pending = await Storage.get('fxBot_v16_PendingPairs', []);
        const idx = await Storage.get('fxBot_v16_PairIndex', 0);
        if (pending.length > 0 && idx < pending.length) {
            const pair = pending[idx];
            await Storage.set('fxBot_v16_PairIndex', idx + 1);
            console.log(`[FXBot] PairIndex ${idx} → ${pair}`);
            return pair;
        }

        // 2. DOM判定（フォールバック）
        for (let attempt = 0; attempt < 5; attempt++) {
            const body = document.body.innerText;
            if (body.includes('米ドル/円') || body.includes('USD/JPY')) return 'USDJPY';
            if (body.includes('ユーロ/ドル') || body.includes('EUR/USD')) return 'EURUSD';
            if (body.includes('豪ドル/円') || body.includes('AUD/JPY')) return 'AUDJPY';
            if (body.includes('ポンド/円') || body.includes('GBP/JPY')) return 'GBPJPY';
            await sleep(1000);
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
        // ユーザー要望「設定値3000なら表示0.3」。DOM取得値(例0.5)と比較するため、設定値3000を1/10000して0.3に変換して比較
        const rawMaxSp = MAX_SPREAD[currentPair] || 1.0;
        const maxSp = (currentPair === 'EURUSD' && rawMaxSp >= 100) ? (rawMaxSp / 10000) : rawMaxSp;

        if (currentPair === 'EURUSD' && sp !== null && sp < 0.01) sp = sp * 10000;

        if (sp !== null && sp > maxSp) return;

        // 自動決済ロジック
        const ac = (await Storage.get('fxBot_settings', {}))?.fxBot_settings?.autoClose?.[currentPair];
        if (ac && ac.enabled && (qL > 0 || qS > 0)) {
            // Pips計算 (クロス円: 円損益/数量*100, EURUSD: 円損益/数量*100/150仮)
            const totalPl = plL + plS;
            const totalQty = qL + qS;
            let currentPips = 0;

            if (totalQty > 0) {
                if (currentPair === 'EURUSD') {
                    // USDJPYレートが不明なため、概算150円で計算
                    currentPips = (totalPl / totalQty) * 100 / 150;
                } else {
                    // クロス円 (USDJPY, AUDJPY, GBPJPY)
                    currentPips = (totalPl / totalQty) * 100;
                }
            }

            // 判定
            if (currentPips >= ac.tp || currentPips <= -ac.sl) {
                // 全決済実行 (ボタンを探す)
                const settleBtn = document.querySelector('button[id*="AllSettle"]') ||
                    document.querySelector('button[class*="pay-all"]') ||
                    Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('全決済') || b.innerText.includes('一括決済'));

                if (settleBtn) {
                    await liveLog(`[${currentPair}] 自動決済実行 (Pips:${currentPips.toFixed(1)})`);
                    settleBtn.click();
                    await sleep(2000); // 処理待ち
                    return; // エントリー処理へ進まない
                }
            }
        }

        // 2. グローバルロックチェック（エントリー過剰防止）
        const now = Date.now();
        const globalLock = await Storage.get('fxBot_v16_GlobalOrderLock', 0);

        // 最低待機時間を確保（設定値またはデフォルト8-15秒）
        const minWait = GLOBAL_ORDER_INTERVAL_MS?.min || 8000;
        const maxWait = GLOBAL_ORDER_INTERVAL_MS?.max || 15000;
        const waitMs = random(minWait, maxWait);

        if (now - globalLock < waitMs) {
            // ロック中は何もしない
            return;
        }

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
        const keyStreak = `WIN_STREAK_${side === 'Long' ? 'L' : 'S'}`;

        // 連勝数更新
        let streak = await getPairCfg(currentPair, keyStreak, 0);
        streak = isWin ? streak + 1 : 0;
        await setPairCfg(currentPair, keyStreak, streak);

        // ステップ更新
        let step = await getPairCfg(currentPair, keyStep, 1);
        if (isWin) {
            step = (step >= BET_STEPS.length) ? 1 : step + 1;
        } else {
            step = 1;
        }
        await setPairCfg(currentPair, keyStep, step);
        await liveLog(`[${currentPair}] ${isWin ? 'Win' : 'Loss'} ${pl.toFixed(1)}円 (Streak:${streak}) → Step${step}`);
    };
    // ========================================================================
    // メインループ
    // ========================================================================
    const startMonitor = (currentPair) => {
        setInterval(async () => {
            const running = await Storage.get(KEYS.RUNNING, false);

            // 常にデータを取得（停止中でも表示更新）
            const sp = getNum(SELECTORS.SPREAD);
            const qL = getNum(SELECTORS.BUY_POS_QTY) || 0;
            const qS = getNum(SELECTORS.SELL_POS_QTY) || 0;
            const plL = getNum(SELECTORS.PL_YEN_BUY) || 0;
            const plS = getNum(SELECTORS.PL_YEN_SELL) || 0;

            // スプレッド表示用
            let displaySp = sp;
            if (currentPair === 'EURUSD' && sp !== null) {
                // DOM値が0.01未満（旧仕様）の場合のみ10000倍する。0.9などの既変換値はそのまま。
                if (sp < 0.01) displaySp = sp * 10000;
            }

            // デバッグログ
            if (sp !== null) {
                console.log(`[FXBot] ${currentPair} rawSp:${sp} -> displaySp:${displaySp}`);
            }

            const rawMaxSp = MAX_SPREAD[currentPair] || 1.0;
            const maxSp = (currentPair === 'EURUSD' && rawMaxSp >= 100) ? (rawMaxSp / 10000) : rawMaxSp;

            // ステータス判定
            let status = '待機中';
            if (!running) {
                status = '停止中';
            } else if (isOrdering) {
                status = 'エントリー中';
            } else if (qL > 0 && qS > 0) {
                status = '両建て保有';
            } else if (qL > 0 || qS > 0) {
                status = 'ポジション保有';
            } else if (displaySp !== null && displaySp > maxSp) {
                status = `SP超過 (${Number(displaySp).toFixed(1)}>${Number(maxSp).toFixed(1)})`;
            } else {
                const now = Date.now();
                const globalLock = await Storage.get('fxBot_v16_GlobalOrderLock', 0);
                const minWait = GLOBAL_ORDER_INTERVAL_MS?.min || 8000;
                const remaining = Math.max(0, minWait - (now - globalLock));
                if (remaining > 0) {
                    status = `待機中 (${Math.ceil(remaining / 1000)}秒)`;
                } else {
                    status = 'エントリー準備OK';
                }
            }

            // 連勝数取得
            const wsL = await getPairCfg(currentPair, 'WIN_STREAK_L', 0);
            const wsS = await getPairCfg(currentPair, 'WIN_STREAK_S', 0);

            // UI更新（常に実行）
            await Storage.set(`fxBot_v16_UI_${currentPair}`, {
                status,
                sp: displaySp, // 数値のまま渡す(main-page.jsで整形)
                maxSp,
                qL, qS, plL, plS,
                wsL, wsS
            });

            // 停止中またはオーダー中はエントリーロジックをスキップ
            if (!running || sp === null || isOrdering) return;

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
        await liveLog(`[${currentPair}] Window Active (v17.4)`);

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
