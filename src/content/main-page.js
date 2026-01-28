// ========================================================================
// FX Bot v17.1 - メイン画面ロジック (CFr00101)
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
        VERSION: '17.1.0',
        DEMO_ONLY: true,
    };

    const PAIR_CODES = ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'];

    const KEYS = {
        RUNNING: 'fxBot_v16_Run',
        LIVE_LOG: 'fxBot_v16_Log',
        HAS_LAUNCHED: 'fxBot_v16_HasLaunched',
    };

    const WINDOW_CONFIG = {
        width: 350,
        height: 500,
        startX: 50,
        startY: 50,
        cols: 2,
        gapX: 20,
        gapY: 30
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
        if (Storage) await Storage.set(KEYS.LIVE_LOG, str);
    };

    // ========================================================================
    // パネル描画
    // ========================================================================
    const createPanel = async () => {
        // 既存パネルがあれば削除
        const existing = document.getElementById('fxbot-panel');
        if (existing) existing.remove();

        // パネル本体
        const panel = document.createElement('div');
        panel.id = 'fxbot-panel';
        panel.innerHTML = `
            <style>
                #fxbot-panel {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    width: 260px;
                    background: linear-gradient(145deg, #1a1a2e, #16213e);
                    border: 1px solid #4dabf7;
                    border-radius: 12px;
                    padding: 16px;
                    z-index: 99999;
                    font-family: 'Segoe UI', sans-serif;
                    color: #e4e4e7;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                }
                #fxbot-panel h3 {
                    margin: 0 0 12px;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                #fxbot-panel .version {
                    font-size: 11px;
                    color: #888;
                    font-weight: normal;
                }
                #fxbot-panel .btn {
                    width: 100%;
                    padding: 12px;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: bold;
                    cursor: pointer;
                    margin-top: 8px;
                    transition: all 0.2s;
                }
                #fxbot-panel .btn-start {
                    background: linear-gradient(135deg, #20c997, #12b886);
                    color: #fff;
                }
                #fxbot-panel .btn-start:hover { background: linear-gradient(135deg, #12b886, #0ca678); }
                #fxbot-panel .btn-stop {
                    background: linear-gradient(135deg, #ff6b6b, #fa5252);
                    color: #fff;
                }
                #fxbot-panel .btn-stop:hover { background: linear-gradient(135deg, #fa5252, #e03131); }
                #fxbot-panel .btn-launch {
                    background: linear-gradient(135deg, #4dabf7, #339af0);
                    color: #fff;
                }
                #fxbot-panel .btn-launch:hover { background: linear-gradient(135deg, #339af0, #228be6); }
                #fxbot-panel .status {
                    margin-top: 12px;
                    padding: 10px;
                    background: rgba(0,0,0,0.3);
                    border-radius: 8px;
                    font-size: 12px;
                    line-height: 1.6;
                }
                #fxbot-panel .status-label {
                    font-size: 11px;
                    color: #888;
                    margin-bottom: 4px;
                }
                #fxbot-panel .log-area {
                    margin-top: 8px;
                    padding: 8px;
                    background: rgba(0,0,0,0.4);
                    border-radius: 6px;
                    font-family: monospace;
                    font-size: 11px;
                    color: #aaa;
                    max-height: 80px;
                    overflow-y: auto;
                }
            </style>
            <h3>🤖 FX Bot <span class="version">v${CONFIG.VERSION}</span></h3>
            <button id="btnLaunch" class="btn btn-launch">🚀 ウィンドウ起動</button>
            <button id="btnStart" class="btn btn-start">▶️ 売買開始</button>
            <button id="btnStop" class="btn btn-stop" style="display:none;">⏹️ 売買停止</button>
            <div class="status">
                <div class="status-label">📊 ステータス</div>
                <div id="statusText">待機中...</div>
            </div>
            <div class="log-area" id="logArea">ログなし</div>
        `;
        document.body.appendChild(panel);

        // イベントハンドラ設定
        document.getElementById('btnLaunch').addEventListener('click', async () => {
            await launchOneTouchWindows();
        });

        document.getElementById('btnStart').addEventListener('click', async () => {
            await Storage.set(KEYS.RUNNING, true);
            document.getElementById('btnStart').style.display = 'none';
            document.getElementById('btnStop').style.display = 'block';
            document.getElementById('statusText').textContent = '売買中...';
            await liveLog('売買を開始しました');
        });

        document.getElementById('btnStop').addEventListener('click', async () => {
            await Storage.set(KEYS.RUNNING, false);
            document.getElementById('btnStart').style.display = 'block';
            document.getElementById('btnStop').style.display = 'none';
            document.getElementById('statusText').textContent = '停止中';
            await liveLog('売買を停止しました');
        });

        // ログ更新ループ
        setInterval(async () => {
            const log = await Storage.get(KEYS.LIVE_LOG, 'ログなし');
            const logArea = document.getElementById('logArea');
            if (logArea) logArea.textContent = log;
        }, 1000);

        // 現在の状態を反映
        const isRunning = await Storage.get(KEYS.RUNNING, false);
        if (isRunning) {
            document.getElementById('btnStart').style.display = 'none';
            document.getElementById('btnStop').style.display = 'block';
            document.getElementById('statusText').textContent = '売買中...';
        }

        await liveLog('パネルを表示しました');
    };

    // ========================================================================
    // ウィンドウ起動ロジック（iframe内ボタン探索・物理クリック方式）
    // ========================================================================
    const launchOneTouchWindows = async () => {
        await liveLog('ウィンドウ起動を開始...');
        document.getElementById('statusText').textContent = 'ウィンドウを起動中...';

        // ペア情報をストレージに保存
        await Storage.set('fxBot_v16_PendingPairs', PAIR_CODES);
        await Storage.set('fxBot_v16_PairIndex', 0);

        const positions = PAIR_CODES.map((pair, i) => ({
            pair: pair,
            x: WINDOW_CONFIG.startX + (i % WINDOW_CONFIG.cols) * (WINDOW_CONFIG.width + WINDOW_CONFIG.gapX),
            y: WINDOW_CONFIG.startY + Math.floor(i / WINDOW_CONFIG.cols) * (WINDOW_CONFIG.height + WINDOW_CONFIG.gapY)
        }));
        await Storage.set('fxBot_v16_WindowPositions', positions);

        // ボタン探索 (リトライ30秒)
        let btn = null;
        for (let attempt = 0; attempt < 15; attempt++) {
            // iframe内を探索
            const iframe = document.querySelector('iframe[name="mainMenu"]');
            if (iframe) {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    btn = doc.querySelector('a[onclick*="_openStream"]');
                } catch (e) {
                    console.warn('iframe access error:', e);
                }
            }
            // フォールバック: メインドキュメント内を探索
            if (!btn) {
                btn = document.querySelector('a[onclick*="_openStream"]') ||
                    Array.from(document.querySelectorAll('button, a')).find(el =>
                        el.textContent && el.textContent.includes('ワンタッチ')
                    );
            }

            if (btn) break;
            await liveLog(`ボタン探索中... (${attempt + 1}/15)`);
            await sleep(2000);
        }

        if (!btn) {
            await liveLog('エラー: 起動ボタンが見つかりません');
            document.getElementById('statusText').textContent = '起動失敗';
            return;
        }

        // 各通貨ペア分クリック
        for (let i = 0; i < PAIR_CODES.length; i++) {
            const pair = PAIR_CODES[i];
            btn.click();
            await liveLog(`[${pair}] ウィンドウ起動`);
            await sleep(3000); // セッション混線防止
        }

        await liveLog('全ウィンドウ起動完了');
        document.getElementById('statusText').textContent = 'ウィンドウ起動完了';
        await Storage.set(KEYS.HAS_LAUNCHED, true);
    };

    // ========================================================================
    // 初期化
    // ========================================================================
    const init = async () => {
        console.log(`FX Bot v${CONFIG.VERSION} - Main Page Loaded`);

        // Storage読み込み待機
        if (!window.FXBotStorage) {
            console.error('FXBotStorage not found. Waiting...');
            await sleep(1000);
        }

        await createPanel();

        // 自動起動設定のチェック
        const hasLaunched = await Storage.get(KEYS.HAS_LAUNCHED, false);
        if (!hasLaunched) {
            const { fxBot_settings } = await chrome.storage.local.get('fxBot_settings');
            if (fxBot_settings?.autoLaunch !== false) {
                setTimeout(async () => {
                    await launchOneTouchWindows();
                }, 3000);
            }
        }
    };

    // DOMContentLoaded後に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
