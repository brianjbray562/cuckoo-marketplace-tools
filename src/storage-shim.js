// Polyfill for the artifact sandbox's window.storage API
// Maps to localStorage with the same async interface
const PREFIX = "cuckoo_storage_";

if (!window.storage) {
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(PREFIX + key);
      return value !== null ? { key, value } : null;
    },
    async set(key, value) {
      localStorage.setItem(PREFIX + key, value);
    },
    async delete(key) {
      localStorage.removeItem(PREFIX + key);
    },
    async list() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(PREFIX)) {
          keys.push({ key: k.slice(PREFIX.length), value: localStorage.getItem(k) });
        }
      }
      return keys;
    },
  };
}
