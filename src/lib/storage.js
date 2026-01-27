// ========================================================================
// ストレージ共通ユーティリティ
// GM_setValue/GM_getValue の代替として chrome.storage.local を使用
// ========================================================================

const Storage = {
    // 設定を取得
    async get(key, defaultValue = null) {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key] !== undefined ? result[key] : defaultValue);
            });
        });
    },

    // 設定を保存
    async set(key, value) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        });
    },

    // 設定を削除
    async remove(key) {
        return new Promise((resolve) => {
            chrome.storage.local.remove([key], resolve);
        });
    },

    // 複数の設定を一括取得
    async getMultiple(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, resolve);
        });
    },

    // 複数の設定を一括保存
    async setMultiple(obj) {
        return new Promise((resolve) => {
            chrome.storage.local.set(obj, resolve);
        });
    },

    // 全設定をクリア
    async clear() {
        return new Promise((resolve) => {
            chrome.storage.local.clear(resolve);
        });
    }
};

// グローバルに公開
window.FXBotStorage = Storage;
