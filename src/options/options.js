// ========================================================================
// FX Bot v17.4 - オプションページロジック
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

    // 自動保存＆Undo用
    setupAutoSaveAndUndo();

    setInterval(updateLog, 1000);
});

// 履歴管理
const settingsHistory = [];
const MAX_HISTORY = 20;
let isRestoring = false;

function setupAutoSaveAndUndo() {
    // 自動保存 (Debounce)
    let timeout;
    const triggerSave = () => {
        if (isRestoring) return;
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            await pushHistory();
            await saveSettings(true); // true=toastなし
        }, 500);
    };

    document.querySelectorAll('input').forEach(el => {
        el.addEventListener('input', triggerSave);
        el.addEventListener('change', triggerSave);
    });

    // Undo (Ctrl+Z / Cmd+Z)
    document.addEventListener('keydown', async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            await undoSettings();
        }
    });
}

async function pushHistory() {
    const current = await chrome.storage.local.get('fxBot_settings');
    if (settingsHistory.length > 0) {
        // 直前と同じなら保存しない
        const last = JSON.stringify(settingsHistory[settingsHistory.length - 1]);
        if (last === JSON.stringify(current)) return;
    }
    settingsHistory.push(current);
    if (settingsHistory.length > MAX_HISTORY) settingsHistory.shift();
}

async function undoSettings() {
    if (settingsHistory.length === 0) {
        showToast('これ以上戻せません', true);
        return;
    }
    isRestoring = true;
    const prev = settingsHistory.pop();
    await chrome.storage.local.set(prev);
    await loadSettings();
    showToast('↩ 元に戻しました');
    isRestoring = false;
}

async function loadSettings() {
    const { fxBot_settings } = await chrome.storage.local.get('fxBot_settings');
    const settings = fxBot_settings || getDefaultSettings();

    const pairs = ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'];
    pairs.forEach(pair => {
        const checkbox = document.getElementById(`pair_${pair}`);
        if (checkbox) checkbox.checked = settings.enabledPairs?.includes(pair) ?? true;

        const spreadInput = document.getElementById(`spread_${pair}`);
        if (spreadInput && settings.maxSpread) {
            let val = settings.maxSpread[pair] || getDefaultSpread(pair);
            // EUR/USDの変換ロジック (保存値3000 -> 表示0.3)
            if (pair === 'EURUSD' && val >= 100) {
                val = val / 10000;
            }
            spreadInput.value = Number(val).toFixed(1);
        }

        // 自動決済設定
        const ac = settings.autoClose?.[pair] || { enabled: false, tp: 20.0, sl: 10.0 };
        const acCheck = document.getElementById(`ac_${pair}`);
        const tpInput = document.getElementById(`tp_${pair}`);
        const slInput = document.getElementById(`sl_${pair}`);

        if (acCheck) acCheck.checked = ac.enabled;
        if (tpInput) tpInput.value = ac.tp;
        if (slInput) slInput.value = ac.sl;
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

async function saveSettings(silent = false) {
    const pairs = ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'];
    const maxSpread = {};
    const autoClose = {};

    pairs.forEach(pair => {
        let val = parseFloat(document.getElementById(`spread_${pair}`)?.value) || getDefaultSpread(pair);
        // EUR/USDの変換ロジック (表示0.3 -> 保存値3000)
        if (pair === 'EURUSD') {
            val = val * 10000;
        }
        maxSpread[pair] = val;

        // 自動決済設定取得
        autoClose[pair] = {
            enabled: document.getElementById(`ac_${pair}`)?.checked || false,
            tp: parseFloat(document.getElementById(`tp_${pair}`)?.value) || 20.0,
            sl: parseFloat(document.getElementById(`sl_${pair}`)?.value) || 10.0
        };
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
        autoClose,
        autoLaunch: document.getElementById('autoLaunch').checked
    };

    await chrome.storage.local.set({ fxBot_settings: settings });

    // 自動保存時はロードし直すとカーソルが飛ぶ可能性があるので、値同期だけに留めるべきだが、
    // EURUSD変換などがあるため一応ロードする。ただしフォーカス維持が必要。
    // 今回は簡易実装としてリロードする（入力中にカーソルが外れるリスクあり）。
    // -> 修正: loadSettingsはUI反映を行うため、連打されると不快。storage保存だけで十分？
    // しかしEURUSDの変換ロジックを通さないと内部値がずれる恐れはない（DOM値を取得して変換して保存だから）。
    // したがって、saveSettings内でloadSettingsを呼ぶのは「保存ボタン」押下時のみにするのが良いが、
    // ここではsilentじゃない時だけloadSettingsを呼ぶようにする。

    if (!silent) {
        await loadSettings();
        showToast('✓ 保存しました');
    } else {
        console.log('Auto saved.');
        // 自動保存通知（控えめに）
        const statusEl = document.getElementById('updateMessage');
        if (statusEl) {
            const origin = statusEl.innerHTML;
            statusEl.textContent = '自動保存しました...';
            setTimeout(() => { if (statusEl.innerHTML === '自動保存しました...') statusEl.innerHTML = origin; }, 1000);
        }
    }
}

function getDefaultSettings() {
    return {
        enabledPairs: ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'],
        betSteps: [1000, 2000, 4000],
        orderCooldown: { min: 8000, max: 15000 },
        globalInterval: { min: 8000, max: 15000 },
        maxSpread: { USDJPY: 0.2, EURUSD: 3000.0, AUDJPY: 0.5, GBPJPY: 1.0 },
        autoClose: {
            USDJPY: { enabled: false, tp: 20.0, sl: 10.0 },
            EURUSD: { enabled: false, tp: 20.0, sl: 10.0 },
            AUDJPY: { enabled: false, tp: 20.0, sl: 10.0 },
            GBPJPY: { enabled: false, tp: 20.0, sl: 10.0 }
        },
        autoLaunch: true
    };
}

function getDefaultSpread(pair) {
    // デフォルト値変更: USDJPY:0.2, EURUSD:3000.0 (表示0.3), AUDJPY:0.5, GBPJPY:1.0
    const map = { USDJPY: 0.2, EURUSD: 3000.0, AUDJPY: 0.5, GBPJPY: 1.0 };
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
    showToast('✓ エクスポート完了');
}

async function importSettings(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        await chrome.storage.local.set(data);
        await loadSettings();
        showToast('✓ インポート完了');
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
    showToast('✓ リセット完了');
}

async function checkUpdate() {
    const btn = document.getElementById('btnCheckUpdate');
    btn.disabled = true;
    btn.textContent = '確認中...';

    try {
        const result = await chrome.runtime.sendMessage({ action: 'checkUpdate' });
        const msgEl = document.getElementById('updateMessage');

        if (result && result.hasUpdate) {
            const downloadUrl = result.downloadUrl || 'https://github.com/yamaga101/fx-bot-chrome-extension/releases';
            msgEl.innerHTML = `
                <span class="has-update">🎉 v${result.latestVersion} が利用可能！</span><br>
                <a href="${downloadUrl}" target="_blank">📥 ダウンロードページを開く</a>
            `;
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

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}
