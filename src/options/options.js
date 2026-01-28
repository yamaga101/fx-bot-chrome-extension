// ========================================================================
// FX Bot v17.3 - オプションページロジック
// ========================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    document.getElementById('currentVersion').textContent = chrome.runtime.getManifest().version;

    document.getElementById('btnSave').addEventListener('click', saveSettings);
    document.getElementById('btnExport').addEventListener('click', exportSettings);
    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', importSettings);
    document.getElementById('btnReset').addEventListener('click', resetSettings);
    document.getElementById('btnCheckUpdate').addEventListener('click', checkUpdate);

    setInterval(updateLog, 1000);
});

async function loadSettings() {
    const { fxBot_settings } = await chrome.storage.local.get('fxBot_settings');
    const settings = fxBot_settings || getDefaultSettings();

    const pairs = ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'];
    pairs.forEach(pair => {
        const checkbox = document.getElementById(`pair_${pair}`);
        if (checkbox) checkbox.checked = settings.enabledPairs?.includes(pair) ?? true;

        const spreadInput = document.getElementById(`spread_${pair}`);
        if (spreadInput && settings.maxSpread) {
            // 全ペア共通で小数点第一位表示
            const val = settings.maxSpread[pair] || getDefaultSpread(pair);
            spreadInput.value = Number(val).toFixed(1);
        }
    });

    if (settings.betSteps) {
        document.getElementById('betStep1').value = settings.betSteps[0] || 1000;
        document.getElementById('betStep2').value = settings.betSteps[1] || 2000;
        document.getElementById('betStep3').value = settings.betSteps[2] || 4000;
    }

    const gInterval = settings.globalInterval || { min: 8000, max: 15000 };
    document.getElementById('commonIntervalMin').value = (gInterval.min / 1000).toFixed(1);
    document.getElementById('commonIntervalMax').value = (gInterval.max / 1000).toFixed(1);

    document.getElementById('autoLaunch').checked = settings.autoLaunch !== false;
}

async function saveSettings() {
    const pairs = ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'];
    const maxSpread = {};

    pairs.forEach(pair => {
        const val = parseFloat(document.getElementById(`spread_${pair}`)?.value) || getDefaultSpread(pair);
        maxSpread[pair] = val;
    });

    const commonInterval = {
        min: (parseFloat(document.getElementById('commonIntervalMin').value) || 8) * 1000,
        max: (parseFloat(document.getElementById('commonIntervalMax').value) || 15) * 1000
    };

    if (commonInterval.min < 1000) commonInterval.min = 1000;
    if (commonInterval.max < 1000) commonInterval.max = 1000;
    if (commonInterval.min > commonInterval.max) {
        [commonInterval.min, commonInterval.max] = [commonInterval.max, commonInterval.min];
    }

    const settings = {
        enabledPairs: pairs.filter(p => document.getElementById(`pair_${p}`)?.checked),
        betSteps: [
            parseInt(document.getElementById('betStep1').value) || 1000,
            parseInt(document.getElementById('betStep2').value) || 2000,
            parseInt(document.getElementById('betStep3').value) || 4000
        ],
        orderCooldown: commonInterval,
        globalInterval: commonInterval,
        maxSpread,
        autoLaunch: document.getElementById('autoLaunch').checked
    };

    await chrome.storage.local.set({ fxBot_settings: settings });

    // 数値フォーマットを再整形して表示
    await loadSettings();

    // トースト表示
    showToast('✓ 設定を保存しました');
}

function getDefaultSettings() {
    return {
        enabledPairs: ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'],
        betSteps: [1000, 2000, 4000],
        orderCooldown: { min: 8000, max: 15000 },
        globalInterval: { min: 8000, max: 15000 },
        maxSpread: { USDJPY: 0.5, EURUSD: 0.5, AUDJPY: 1.0, GBPJPY: 1.5 },
        autoLaunch: true
    };
}

function getDefaultSpread(pair) {
    const map = { USDJPY: 0.5, EURUSD: 0.5, AUDJPY: 1.0, GBPJPY: 1.5 };
    return map[pair] || 0.5;
}

async function exportSettings() {
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fx-bot-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ エクスポートしました');
}

async function importSettings(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        await chrome.storage.local.set(data);
        await loadSettings();
        showToast('✓ インポートしました');
    } catch (error) {
        showToast('✗ インポート失敗', true);
    }
    e.target.value = '';
}

async function resetSettings() {
    if (!confirm('すべての設定をリセットしますか？')) return;
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
        fxBot_settings: getDefaultSettings(),
        'fxBot_v16_Run': false,
        'fxBot_v16_HasLaunched': false
    });
    await loadSettings();
    showToast('✓ リセットしました');
}

async function checkUpdate() {
    const btn = document.getElementById('btnCheckUpdate');
    btn.disabled = true;
    btn.textContent = '確認中...';
    try {
        const result = await chrome.runtime.sendMessage({ action: 'checkUpdate' });
        const msgEl = document.getElementById('updateMessage');
        if (result && result.hasUpdate) {
            msgEl.innerHTML = `<span class="has-update">🎉 v${result.latestVersion} が利用可能！</span>`;
        } else {
            msgEl.textContent = '✓ 最新バージョンです';
        }
    } catch (error) {
        document.getElementById('updateMessage').textContent = '更新確認に失敗しました';
    }
    btn.disabled = false;
    btn.textContent = '更新を確認';
}

async function updateLog() {
    const { fxBot_v16_Log } = await chrome.storage.local.get('fxBot_v16_Log');
    document.getElementById('logDisplay').textContent = fxBot_v16_Log || 'ログなし';
}

function showToast(message, isError = false) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // アニメーション後に削除
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}
