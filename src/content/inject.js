// ========================================================================
// FX Bot - Injected Script (MAIN Context)
// ページコンテキストで実行され、サイト定義の関数を直接呼び出す
// ========================================================================

(function () {
    'use strict';

    console.log('FX Bot: Inject script loaded');

    // 拡張機能からのメッセージを受信
    window.addEventListener('message', function (event) {
        // 出所チェック
        if (event.source !== window) return;
        if (!event.data || event.data.type !== 'FXBOT_EXEC_CMD') return;

        const { command, pair } = event.data;

        if (command === 'openWindow') {
            console.log(`FX Bot: Opening window for ${pair}...`);
            openWindowForPair(pair);
        }
    });

    // ペアごとのウィンドウを開く
    function openWindowForPair(pair) {
        // 1. グローバル関数 _openStream があるか確認 (旧システム)
        if (typeof window._openStream === 'function') {
            const codeMap = {
                'USDJPY': 'USDJPY', // 必要ならサイト側のコードにマッピング
                'EURUSD': 'EURUSD',
                'AUDJPY': 'AUDJPY',
                'GBPJPY': 'GBPJPY'
            };
            // サイトによって引数が違う可能性があるため、onclick属性から解析するのがベストだが
            // まずは一般的な関数呼び出しを試みる
            try {
                // _openStreamの引数が不明な場合があるため、既存のDOM要素を探して解析
                const btn = findButtonForPair(pair);
                if (btn) {
                    // onclick="return _openStream('USDJPY', ...)" のようになっている場合
                    const match = btn.getAttribute('onclick')?.match(/_openStream\(['"](.+?)['"]/);
                    if (match && match[1]) {
                        console.log(`FX Bot: Calling _openStream('${match[1]}')...`);
                        window._openStream(match[1]);
                        return;
                    }
                }
                // 見つからない場合はペア名をそのまま渡してみる
                window._openStream(pair);
            } catch (e) {
                console.error('FX Bot: _openStream exec failed', e);
            }
            return;
        }

        // 2. ボタンを探してクリックする (ネイティブクリック)
        // ページコンテキストからのクリックならCSPに引っかからない場合がある
        const btn = findButtonForPair(pair);
        if (btn) {
            console.log('FX Bot: Clicking button...', btn);
            btn.click();
        } else {
            console.error(`FX Bot: Button not found for ${pair}`);
        }
    }

    // ペアに対応するボタンDOMを探すヘルパー
    function findButtonForPair(pair) {
        // ペア名が含まれる行やコンテナを探し、その中のボタンを見つける
        // サイト構造依存のため、ヒューリスティックに探索

        // 1. ペア名を含む要素を探す
        const pairTexts = {
            'USDJPY': ['USD/JPY', '米ドル/円'],
            'EURUSD': ['EUR/USD', 'ユーロ/ドル'],
            'AUDJPY': ['AUD/JPY', '豪ドル/円'],
            'GBPJPY': ['GBP/JPY', 'ポンド/円']
        };
        const targets = pairTexts[pair] || [pair];

        // XPath等で探すのが確実だが簡便に
        const allDivs = document.querySelectorAll('div, tr, td');
        for (const el of allDivs) {
            if (targets.some(t => el.innerText && el.innerText.includes(t))) {
                // この要素の周辺にある "ワンタッチ" ボタンや "チャート" ボタンを探す
                const btn = el.querySelector('a[onclick*="_openStream"], button, input[type="button"]');
                if (btn) return btn;

                // 親要素も探す
                const parentBtn = el.parentElement?.querySelector('a[onclick*="_openStream"]');
                if (parentBtn) return parentBtn;
            }
        }

        return document.querySelector('a[onclick*="_openStream"]'); // フォールバック
    }

})();
