// ========================================================================
// FX Bot v16.2 - Service Worker (Background)
// 拡張機能のバックグラウンド処理
// ========================================================================

// インストール時の初期化
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log('FX Bot v16.2 installed');

        // 初期設定
        await chrome.storage.local.set({
            'fxBot_v16_Run': false,
            'fxBot_v16_HasLaunched': false,
            'fxBot_settings': {
                enabledPairs: ['USDJPY', 'EURUSD', 'AUDJPY', 'GBPJPY'],
                betSteps: [1000, 2000, 4000],
                orderCooldown: 10000,
                autoLaunch: true
            }
        });
    }

    if (details.reason === 'update') {
        console.log(`FX Bot updated to v${chrome.runtime.getManifest().version}`);
    }
});

// メッセージ受信（オプションページを開く等）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openOptions') {
        chrome.runtime.openOptionsPage();
    }

    if (message.action === 'checkUpdate') {
        checkForUpdate().then(sendResponse);
        return true; // 非同期レスポンス
    }

    if (message.action === 'launchWindow') {
        const { url, x, y, width, height } = message.data;
        chrome.windows.create({
            url: url,
            left: Math.round(x),
            top: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
            type: 'popup',
            focused: false
        });
        sendResponse({ status: 'ok' });
    }
});

// 更新チェック（GitHub Releases API）
async function checkForUpdate() {
    try {
        const response = await fetch(
            'https://api.github.com/repos/yamaga101/fx-bot-chrome-extension/releases/latest',
            { headers: { 'Accept': 'application/vnd.github.v3+json' } }
        );

        if (!response.ok) return { hasUpdate: false };

        const data = await response.json();
        const latestVersion = data.tag_name.replace('v', '');
        const currentVersion = chrome.runtime.getManifest().version;

        const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

        if (hasUpdate) {
            // バッジ表示
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b' });
        }

        return {
            hasUpdate,
            latestVersion,
            currentVersion,
            downloadUrl: data.assets?.[0]?.browser_download_url || data.html_url
        };
    } catch (error) {
        console.error('Update check failed:', error);
        return { hasUpdate: false, error: error.message };
    }
}

// バージョン比較
function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);

    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

// 定期的な更新チェック（6時間ごと）
chrome.alarms.create('checkUpdate', { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkUpdate') {
        checkForUpdate();
    }
});
