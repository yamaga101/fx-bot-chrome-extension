// ========================================================================
// FX Bot v16.3 - オプションページロジック
// ========================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 設定読み込み
    await loadSettings();

    // バージョン表示
    document.getElementById('currentVersion').textContent = chrome.runtime.getManifest().version;

    // イベントリスナー設定
    document.getElementById('btnSave').addEventListener('click', saveSettings);
    document.getElementById('btnExport').addEventListener('click', exportSettings);
    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', importSettings);
    document.getElementById('btnReset').addEventListener('click', resetSettings);
    document.getElementById('btnCheckUpdate').addEventListener('click', checkUpdate);

    // ログ表示の定期更新
    setInterval(updateLog, 1000);
});

// 設定読み込み
async function loadSettings() {
    const { fxBot_settings } = await chrome.storage.local.get('fxBot_settings');
    const settings = fxBot_settings || getDefaultSettings();

    // 通貨ペア
    const pairs = ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'];
    pairs.forEach(pair => {
        // 有効無効
        const checkbox = document.getElementById(`pair_${pair}`);
        if (checkbox) checkbox.checked = settings.enabledPairs?.includes(pair) ?? true;

        // スプレッド設定
        const spreadInput = document.getElementById(`spread_${pair}`);
        if (spreadInput && settings.maxSpread) {
            spreadInput.value = settings.maxSpread[pair] || getDefaultSpread(pair);
        }

        // 遅延設定
        const delayInput = document.getElementById(`delay_${pair}`);
        if (delayInput && settings.pairDelays) {
            delayInput.value = settings.pairDelays[pair] || 0;
        }
    });

    // ベットステップ
    if (settings.betSteps) {
        document.getElementById('betStep1').value = settings.betSteps[0] || 1000;
        document.getElementById('betStep2').value = settings.betSteps[1] || 2000;
        document.getElementById('betStep3').value = settings.betSteps[2] || 4000;
    }

    // その他
    document.getElementById('orderCooldown').value = (settings.orderCooldown || 10000) / 1000;
    document.getElementById('globalInterval').value = (settings.globalInterval || 8000) / 1000;
    document.getElementById('autoLaunch').checked = settings.autoLaunch !== false;
}

// 設定保存
async function saveSettings() {
    const pairs = ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'];
    const enabledPairs = pairs.filter(pair => document.getElementById(`pair_${pair}`)?.checked);

    // スプレッド設定の収集
    const maxSpread = {};
    const pairDelays = {};
    pairs.forEach(pair => {
        maxSpread[pair] = parseFloat(document.getElementById(`spread_${pair}`)?.value) || getDefaultSpread(pair);
        pairDelays[pair] = parseInt(document.getElementById(`delay_${pair}`)?.value) || 0;
    });

    const settings = {
        enabledPairs,
        betSteps: [
            parseInt(document.getElementById('betStep1').value) || 1000,
            parseInt(document.getElementById('betStep2').value) || 2000,
            parseInt(document.getElementById('betStep3').value) || 4000
        ],
        orderCooldown: (parseInt(document.getElementById('orderCooldown').value) || 15) * 1000,
        globalInterval: (parseInt(document.getElementById('globalInterval').value) || 8) * 1000,
        maxSpread,
        pairDelays,
        autoLaunch: document.getElementById('autoLaunch').checked
    };

    await chrome.storage.local.set({ fxBot_settings: settings });
    showToast('設定を保存しました');
}

// デフォルト設定
function getDefaultSettings() {
    return {
        enabledPairs: ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'],
        betSteps: [1000, 2000, 4000],
        orderCooldown: 15000,
        globalInterval: 8000,
        maxSpread: {
            USDJPY: 0.4,
            EURUSD: 0.00005,
            AUDJPY: 0.7,
            GBPJPY: 1.0
        },
        pairDelays: {
            USDJPY: 0,
            EURUSD: 10,
            AUDJPY: 20,
            GBPJPY: 30
        },
        autoLaunch: true
    };
}

// 通貨ペアごとのデフォルトスプレッド
function getDefaultSpread(pair) {
    const map = { USDJPY: 0.4, EURUSD: 0.00005, AUDJPY: 0.7, GBPJPY: 1.0 };
    return map[pair] || 0.5;
}

// エクスポート
async function exportSettings() {
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `fx-bot-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('設定をエクスポートしました');
}

// インポート
async function importSettings(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);
        await chrome.storage.local.set(data);
        await loadSettings();
        showToast('設定をインポートしました');
    } catch (error) {
        showToast('インポートに失敗しました', true);
        console.error(error);
    }

    e.target.value = '';
}

// リセット
async function resetSettings() {
    if (!confirm('すべての設定をリセットしますか？')) return;

    await chrome.storage.local.clear();
    await chrome.storage.local.set({
        fxBot_settings: getDefaultSettings(),
        'fxBot_v16_Run': false,
        'fxBot_v16_HasLaunched': false
    });
    await loadSettings();
    showToast('設定をリセットしました');
}

// 更新チェック
async function checkUpdate() {
    const btn = document.getElementById('btnCheckUpdate');
    btn.disabled = true;
    btn.textContent = '確認中...';

    try {
        const result = await chrome.runtime.sendMessage({ action: 'checkUpdate' });
        const msgEl = document.getElementById('updateMessage');

        if (result.hasUpdate) {
            msgEl.innerHTML = `<span class="has-update">🎉 新バージョン v${result.latestVersion} が利用可能です！</span><br>
                <a href="${result.downloadUrl}" target="_blank" style="color: #4dabf7;">ダウンロード</a>`;
        } else {
            msgEl.textContent = '✓ 最新バージョンです';
        }
    } catch (error) {
        document.getElementById('updateMessage').textContent = '更新の確認に失敗しました';
    }

    btn.disabled = false;
    btn.textContent = '更新を確認';
}

// ログ更新
async function updateLog() {
    const { fxBot_v16_Log } = await chrome.storage.local.get('fxBot_v16_Log');
    document.getElementById('logDisplay').textContent = fxBot_v16_Log || 'ログなし';
}

// トースト表示
function showToast(message, isError = false) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}
