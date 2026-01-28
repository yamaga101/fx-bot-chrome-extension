// ========================================================================
// FX Bot v16.2 - メイン画面ロジック (CFr00101)
// パネルUI表示、ワークフロー起動制御
// ========================================================================

(function () {
    'use strict';

    // iframeから実行された場合はスキップ
    if (window.self !== window.top) return;

    // ========================================================================
    // 設定 & 定数
    // ========================================================================
    const CONFIG = {
        VERSION: '16.6',
        DEMO_ONLY: true,
    };

    const CURRENCY_PAIRS = {
        USDJPY: { code: 'USDJPY', name: 'USD/JPY', style: '#4dabf7' },
        EURUSD: { code: 'EURUSD', name: 'EUR/USD', style: '#fab005' },
        AUDJPY: { code: 'AUDJPY', name: 'AUD/JPY', style: '#ff6b6b' },
        GBPJPY: { code: 'GBPJPY', name: 'GBP/JPY', style: '#20c997' }
    };
    const PAIR_CODES = Object.keys(CURRENCY_PAIRS);

    const KEYS = {
        RUNNING: 'fxBot_v16_Run',
        LIVE_LOG: 'fxBot_v16_Log',
        PANEL_POS: 'fxBot_v16_PPos',
        HAS_LAUNCHED: 'fxBot_v16_HasLaunched'
    };

    // ========================================================================
    // ユーティリティ
    // ========================================================================
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const Storage = window.FXBotStorage;

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

    // ========================================================================
    // WINDOW CONFIG
    // ========================================================================
    const WINDOW_CONFIG = {
        width: 330,
        height: 500,
        cols: 2,
        gapX: 20,
        gapY: 50,
        startX: 50,
        startY: 50
    };

    // ========================================================================
    // パネルUI生成
    // ========================================================================
    const createPanel = async () => {
        await sleep(1000);

        // 初期状態は停止
        await Storage.set(KEYS.RUNNING, false);

        const div = document.createElement('div');
        div.id = 'fxBotPanel';
        const pos = await Storage.get(KEYS.PANEL_POS, { top: '10px', left: '', right: '10px' });
        div.style.cssText = `
            position: fixed; top: ${pos.top}; ${pos.left ? 'left:' + pos.left : 'right:' + pos.right};
            width: 360px; z-index: 999999;
            background: rgba(16, 20, 30, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            font-family: 'Segoe UI', sans-serif;
            color: #fff; overflow: hidden;
            transition: height 0.3s;
        `;

        div.innerHTML = `
            <div id="fxBotHeader" style="padding: 12px 16px; background: rgba(255, 255, 255, 0.05); display: flex; align-items: center; justify-content: space-between; cursor: move;">
                <div style="font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 8px;"><span>🤖</span> FX Bot v${CONFIG.VERSION}</div>
                <div style="font-size: 10px; opacity: 0.7;">ウィンドウ準備 → 稼働開始</div>
            </div>
            <div style="padding: 16px;">
                <div id="msgAutoLaunch" style="font-size: 11px; color: #4dabf7; margin-bottom: 8px; text-align: center;">ウィンドウを起動してください</div>

                <button id="btnLaunchWindows" style="width: 100%; padding: 12px; background: #4dabf7; border: none; border-radius: 8px; color: #fff; font-weight: bold; cursor: pointer; margin-bottom: 8px;">🚀 ウィンドウ起動</button>

                <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                    <button id="btnStart" style="flex: 1; padding: 12px; background: #20c997; border: none; border-radius: 8px; color: #fff; font-weight: bold; cursor: pointer;">▶ 自動売買 ON</button>
                    <button id="btnStop" style="flex: 1; padding: 12px; background: #ff6b6b; border: none; border-radius: 8px; color: #fff; font-weight: bold; cursor: pointer; display: none;">⏸ 自動売買 OFF</button>
                </div>

                <div id="pairList" style="max-height: 400px; overflow-y: auto;"></div>

                <div style="margin-top: 12px; font-size: 11px; color: #888; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>STATUS: <span id="uiStatus" style="color: #fff;">停止中</span></span>
                    </div>
                    <div id="uiLog" style="margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #bbb;">...</div>
                    <div style="text-align: right; margin-top: 8px;">
                        <small id="btnReset" style="cursor: pointer; color: #666;">Reset Settings</small>
                        <small id="btnOptions" style="cursor: pointer; color: #4dabf7; margin-left: 12px;">⚙ 設定</small>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);

        // ドラッグ機能
        const header = document.getElementById('fxBotHeader');
        header.onmousedown = e => {
            let ox = e.clientX - div.offsetLeft, oy = e.clientY - div.offsetTop;
            const move = e => {
                div.style.left = (e.clientX - ox) + 'px';
                div.style.top = (e.clientY - oy) + 'px';
                div.style.right = 'auto';
            };
            const stop = async () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', stop);
                await Storage.set(KEYS.PANEL_POS, { top: div.style.top, left: div.style.left });
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', stop);
        };

        // ボタン処理
        const bStart = document.getElementById('btnStart');
        const bStop = document.getElementById('btnStop');

        const toggleRun = async (run) => {
            await Storage.set(KEYS.RUNNING, run);
            bStart.style.display = run ? 'none' : 'block';
            bStop.style.display = run ? 'block' : 'none';
            document.getElementById('uiStatus').textContent = run ? '稼働中（売買ON）' : '停止中（売買OFF）';
            document.getElementById('uiStatus').style.color = run ? '#20c997' : '#ff6b6b';
        };

        bStart.onclick = () => toggleRun(true);
        bStop.onclick = () => toggleRun(false);

        // ウィンドウ起動ボタン
        document.getElementById('btnLaunchWindows').onclick = async () => {
            await launchOneTouchWindows();
        };

        // 設定ボタン（オプションページを開く）
        document.getElementById('btnOptions').onclick = () => {
            chrome.runtime.sendMessage({ action: 'openOptions' });
        };

        // リセットボタン
        document.getElementById('btnReset').onclick = async () => {
            if (confirm('設定と起動状態をリセットしてリロードしますか？')) {
                await Storage.remove(KEYS.RUNNING);
                await Storage.remove(KEYS.HAS_LAUNCHED);
                location.reload();
            }
        };

        // モニタリング
        setInterval(async () => {
            document.getElementById('uiLog').textContent = await Storage.get(KEYS.LIVE_LOG, 'Ready');
            const container = document.getElementById('pairList');
            if (!container.innerHTML) {
                container.innerHTML = PAIR_CODES.map(pair => `
                    <div id="card_${pair}" style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 10px; margin-bottom: 8px; border-left: 4px solid ${CURRENCY_PAIRS[pair].style};">
                        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
                            <b>${CURRENCY_PAIRS[pair].name}</b>
                            <span id="pos_${pair}" style="color: #fff;">0</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #aaa;">
                            <span>P/L: <span id="pl_${pair}">0</span></span>
                            <span>SP: <span id="sp_${pair}" style="color: #ffd700;">-</span></span>
                        </div>
                    </div>
                `).join('');
            }
            for (const pair of PAIR_CODES) {
                const stats = await Storage.get(`fxBot_v16_UI_${pair}`, {});
                if (document.getElementById(`pos_${pair}`)) {
                    const q = (stats.qL || 0) + (stats.qS || 0);
                    document.getElementById(`pos_${pair}`).textContent = q > 0 ? `${q}通貨` : 'ノーポジ';
                    const pl = (stats.plL || 0) + (stats.plS || 0);
                    document.getElementById(`pl_${pair}`).textContent = pl.toLocaleString();
                    document.getElementById(`pl_${pair}`).style.color = pl >= 0 ? '#20c997' : '#ff6b6b';
                    document.getElementById(`sp_${pair}`).textContent = stats.sp || '-';
                }
            }
        }, 500);

        return div;
    };

    // ========================================================================
    // ウィンドウ起動ロジック（iframe内ボタン探索・リトライ版）
    // ========================================================================
    const launchOneTouchWindows = async () => {
        const enabledPairs = PAIR_CODES;
        await Storage.set('fxBot_v16_PendingPairs', enabledPairs);
        await Storage.set('fxBot_v16_PairIndex', 0);

        const positions = enabledPairs.map((pair, i) => ({
            pair: pair,
            x: WINDOW_CONFIG.startX + (i % WINDOW_CONFIG.cols) * (WINDOW_CONFIG.width + WINDOW_CONFIG.gapX),
            y: WINDOW_CONFIG.startY + Math.floor(i / WINDOW_CONFIG.cols) * (WINDOW_CONFIG.height + WINDOW_CONFIG.gapY)
        }));
        await Storage.set('fxBot_v16_WindowPositions', positions);

        await liveLog(`ウィンドウ一括起動を準備中...`);

        // リトライループ（最大30秒待機）
        let btn = null;
        for (let attempt = 0; attempt < 15; attempt++) {
            // 1. iframe内のメニューからボタンを探す
            const iframe = document.querySelector('iframe[name="mainMenu"]');
            if (iframe) {
                try {
                    // クロスオリジン制限や、iframeが読み込み中の場合にアクセスエラーになる可能性があるためtry-catchで囲む
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    if (doc) {
                        btn = doc.querySelector('a[onclick*="_openStream"]');
                    }
                } catch (e) {
                    console.warn('iframe access error (ignored):', e);
                    // クロスオリジンエラー等は無視して次へ
                }
            }

            // 2. iframeで見つからない場合、メインフレーム内も探す
            if (!btn) {
                btn = document.querySelector('a[onclick*="_openStream"]') ||
                    Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('ワンタッチ'));
            }

            if (btn) break;

            await liveLog(`起動ボタン探索中... (${attempt + 1}/15)`);
            await sleep(2000);
        }

        if (!btn) {
            await liveLog(`エラー: 起動ボタンが見つかりませんでした。`);
            const msgEl = document.getElementById('msgAutoLaunch');
            if (msgEl) {
                msgEl.textContent = '自動起動失敗。手動でウィンドウを起動してください。';
                msgEl.style.color = '#ff6b6b';
            }
            return;
        }

        await liveLog(`ウィンドウ一括起動を開始...`);

        // 3. 通貨ペアを切り替えながらボタンをクリック
        for (let i = 0; i < enabledPairs.length; i++) {
            const pair = enabledPairs[i];

            // CSP回避: ページコンテキストでクリックを実行する
            // 拡張機能のContent Scriptから直接 .click() するとCSP違反になる場合があるため
            // ページ内にscriptタグを注入して実行させる
            const clickScript = document.createElement('script');
            clickScript.textContent = `
                (function() {
                    const btn = document.querySelector('a[onclick*="_openStream"]') || 
                                Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('ワンタッチ'));
                    if (btn) {
                        btn.click();
                        console.log('FXBot: Clicked launch button via injected script');
                    } else {
                        // iframe内も探す
                        const iframe = document.querySelector('iframe[name="mainMenu"]');
                        if (iframe) {
                            try {
                                const doc = iframe.contentDocument || iframe.contentWindow.document;
                                const iBtn = doc.querySelector('a[onclick*="_openStream"]');
                                if (iBtn) iBtn.click();
                            } catch(e) {}
                        }
                    }
                })();
            `;
            (document.head || document.documentElement).appendChild(clickScript);
            clickScript.remove();

            await liveLog(`[${pair}] 起動シグナル送信 (Injected)`);

            // 次のウィンドウまで待機（同時起動を回避）
            await sleep(2500);
        }

        await liveLog(`全ウィンドウ起動完了`);
        const msgEl = document.getElementById('msgAutoLaunch');
        if (msgEl) {
            msgEl.textContent = 'ウィンドウ起動完了 / 自動売買準備OK';
            msgEl.style.color = '#20c997';
        }
    };

    // ========================================================================
    // 初期化
    // ========================================================================
    const init = async () => {
        await createPanel();

        // 自動起動ロジック
        setTimeout(async () => {
            // 設定で自動起動がONになっているか確認
            const settings = await chrome.storage.local.get('fxBot_settings');
            const autoLaunchEnabled = settings.fxBot_settings?.autoLaunch !== false; // デフォルトtrue

            const hasLaunched = await Storage.get(KEYS.HAS_LAUNCHED, false);
            if (autoLaunchEnabled && !hasLaunched) {
                await launchOneTouchWindows();
                await Storage.set(KEYS.HAS_LAUNCHED, true);
            }
        }, 3000);
    };

    init();
})();
