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
        VERSION: '17.0.0',
        DEMO_ONLY: true,
    };

    // ... (中略: CURRENCY_PAIRS, KEYS, sleep, Storage, getDT, liveLog, WINDOW_CONFIG は既存のまま) ...

    // ========================================================================
    // ウィンドウ起動ロジック（iframe内ボタン探索・v16.5物理クリック方式）
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

        await liveLog(`ウィンドウ一括起動を開始 (Method: Click)...`);

        // リトライループ（最大30秒待機）
        let btn = null;
        for (let attempt = 0; attempt < 15; attempt++) {
            const iframe = document.querySelector('iframe[name="mainMenu"]');
            if (iframe) {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    btn = doc.querySelector('a[onclick*="_openStream"]');
                } catch (e) {
                    console.warn('iframe access error:', e);
                }
            }
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
                msgEl.textContent = '自動起動失敗。ページをリロードするか手動で起動してください。';
                msgEl.style.color = '#ff6b6b';
            }
            return;
        }

        // 3. 通貨ペアを切り替えながら順次クリック
        for (let i = 0; i < enabledPairs.length; i++) {
            const pair = enabledPairs[i];

            // 物理クリックによるウィンドウ起動
            btn.click();
            await liveLog(`[${pair}] ウィンドウ起動指示送信`);

            // 次のウィンドウまで待機（セッション混線防止）
            await sleep(3000);
        }

        await liveLog(`全ウィンドウ起動アクション完了`);
        const msgEl = document.getElementById('msgAutoLaunch');
        if (msgEl) {
            msgEl.textContent = 'ウィンドウ起動アクション完了。売買を開始してください。';
            msgEl.style.color = '#20c997';
        }
    };

    // ========================================================================
    // 初期化
    // ========================================================================
    const init = async () => {
        console.log(`FX Bot v${CONFIG.VERSION} - Main Page Loaded`);
        await createPanel();

        // 起動状態チェック
        const hasLaunched = await Storage.get(KEYS.HAS_LAUNCHED, false);
        if (!hasLaunched) {
            // 自動起動設定がある場合は実行（デフォルトTrue）
            const { fxBot_settings } = await chrome.storage.local.get('fxBot_settings');
            if (fxBot_settings?.autoLaunch !== false) {
                setTimeout(async () => {
                    await launchOneTouchWindows();
                    await Storage.set(KEYS.HAS_LAUNCHED, true);
                }, 3000);
            }
        }
    };

    init();
})();
