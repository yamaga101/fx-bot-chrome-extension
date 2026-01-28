// ========================================================================
// FX Bot v16.8.1 - オプションページロジック
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
            // EURUSDは0.1単位になったので、それ以外と区別せず一律処理でも良いが、念のため小数処理
            const val = settings.maxSpread[pair] || getDefaultSpread(pair);
            // 要望：全数値小数点第一位固定
            spreadInput.value = Number(val).toFixed(1);
        }
    });

    // ベットステップ
    if (settings.betSteps) {
        document.getElementById('betStep1').value = settings.betSteps[0] || 1000;
        document.getElementById('betStep2').value = settings.betSteps[1] || 2000;
        document.getElementById('betStep3').value = settings.betSteps[2] || 4000;
    }

    // その他
    // 旧 orderCooldown は無視し、globalInterval (レンジ) を共通設定として扱う
    const gInterval = settings.globalInterval || { min: 5000, max: 10000 };
    let intervalMin, intervalMax;

    if (typeof gInterval === 'number') {
        // 旧設定からの移行
        intervalMin = (gInterval / 1000) * 0.8;
        intervalMax = (gInterval / 1000) * 1.2;
    } else {
        intervalMin = gInterval.min / 1000;
        intervalMax = gInterval.max / 1000;
    }
    document.getElementById('commonIntervalMin').value = intervalMin.toFixed(1);
    document.getElementById('commonIntervalMax').value = intervalMax.toFixed(1);

    document.getElementById('autoLaunch').checked = settings.autoLaunch !== false;
}

// 設定保存
async function saveSettings() {
    const pairs = ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'];
    const enabledPairs = pairs.filter(pair => document.getElementById(`pair_${pair}`)?.checked);

    // スプレッド設定の収集
    const maxSpread = {};
    pairs.forEach(pair => {
        maxSpread[pair] = parseFloat(document.getElementById(`spread_${pair}`)?.value) || getDefaultSpread(pair);
    });

    // タイミング設定の保存
    // ユーザー要望により「同じペアの待機」と「ペア間の待機」を共通化
    const commonInterval = {
        min: (parseFloat(document.getElementById('commonIntervalMin').value) || 5) * 1000,
        max: (parseFloat(document.getElementById('commonIntervalMax').value) || 10) * 1000
    };

    // バリデーション: 最小値
    if (commonInterval.min < 1000) commonInterval.min = 1000;
    if (commonInterval.max < 1000) commonInterval.max = 1000;

    // バリデーション: 最小 > 最大の場合は入れ替え
    if (commonInterval.min > commonInterval.max) {
        [commonInterval.min, commonInterval.max] = [commonInterval.max, commonInterval.min];
    }

    // UI上の補正
    document.getElementById('commonIntervalMin').value = (commonInterval.min / 1000).toFixed(1);
    document.getElementById('commonIntervalMax').value = (commonInterval.max / 1000).toFixed(1);

    const settings = {
        enabledPairs: pairs.filter(p => document.getElementById(`pair_${p}`)?.checked),
        betSteps: [
            parseInt(document.getElementById('betStep1').value) || 1000,
            parseInt(document.getElementById('betStep2').value) || 2000,
            parseInt(document.getElementById('betStep3').value) || 4000
        ],
        // 統合された設定を使用
        orderCooldown: commonInterval,
        globalInterval: commonInterval,
        maxSpread,
        // pairDelays設定は削除
        // autoLaunch: document.getElementById('autoLaunch').checked // autoLaunchは廃止
    };

    await chrome.storage.local.set({ fxBot_settings: settings });
    showToast('設定を保存しました');
}

// デフォルト設定
function getDefaultSettings() {
    return {
        enabledPairs: ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'],
        betSteps: [1000, 2000, 4000],
        // 両方に同じデフォルトレンジを設定
        orderCooldown: { min: 5000, max: 10000 },
        globalInterval: { min: 5000, max: 10000 },
        maxSpread: {
            USDJPY: 0.4,
            EURUSD: 0.5, // 0.00005 -> 0.5 (pips単位に合わせるためと思われるが、要望通り0.5とする)
            AUDJPY: 0.7,
            GBPJPY: 1.0
        }
        // autoLaunch: 廃止
    };
}

// 通貨ペアごとのデフォルトスプレッド
function getDefaultSpread(pair) {
    const map = { USDJPY: 0.4, EURUSD: 0.5, AUDJPY: 0.7, GBPJPY: 1.0 };
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
