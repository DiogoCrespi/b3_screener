const { test, describe, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

// --- Mocking Setup (Pre-require) ---
const originalExistsSync = fs.existsSync;
const originalMkdirSync = fs.mkdirSync;
const originalWriteFileSync = fs.writeFileSync;
const originalLog = console.log;
const originalError = console.error;
const originalDate = global.Date;

// Prevent storage.js from actually creating directories on require
fs.existsSync = () => true;
fs.mkdirSync = () => {};

const { saveHistory } = require('./storage');

describe('Storage Service', () => {
    let writeCalls = [];
    let logs = [];
    let errors = [];

    beforeEach(() => {
        writeCalls = [];
        logs = [];
        errors = [];

        fs.writeFileSync = (path, data) => {
            writeCalls.push({ path, data: JSON.parse(data) });
        };

        console.log = (...args) => logs.push(args.join(' '));
        console.error = (...args) => errors.push(args.join(' '));

        // Mock Date to 2024-01-01T12:00:00Z
        const mockDate = new Date('2024-01-01T12:00:00Z');
        global.Date = class extends Date {
            constructor() {
                super();
                return mockDate;
            }
            toISOString() { return mockDate.toISOString(); }
            static now() { return mockDate.getTime(); }
        };
    });

    afterEach(() => {
        fs.writeFileSync = originalWriteFileSync;
        console.log = originalLog;
        console.error = originalError;
        global.Date = originalDate;
    });

    test('should save history with full data correctly', () => {
        const results = [{ ticker: 'TEST3', price: 10 }];
        const economy = { dollar: 5.0, selic: 11.0 };

        saveHistory(results, 'stock', economy);

        assert.strictEqual(writeCalls.length, 1);
        const call = writeCalls[0];

        // Check filename format (2024-01-01-stock-results.json)
        assert.ok(call.path.endsWith('2024-01-01-stock-results.json'));

        // Check content
        assert.strictEqual(call.data.type, 'stock');
        assert.strictEqual(call.data.count, 1);
        assert.deepStrictEqual(call.data.economy, economy);
        assert.deepStrictEqual(call.data.items, results);
        assert.ok(call.data.date.startsWith('2024-01-01'));

        // Check log
        assert.ok(logs[0].includes('💾 History saved to: 2024-01-01-stock-results.json'));
    });

    test('should use default parameters when only results are provided', () => {
        const results = [];
        saveHistory(results);

        assert.strictEqual(writeCalls.length, 1);
        const call = writeCalls[0];

        assert.ok(call.path.endsWith('2024-01-01-combined-results.json'));
        assert.strictEqual(call.data.type, 'combined');
        assert.strictEqual(call.data.economy, null);
        assert.strictEqual(call.data.count, 0);
    });

    test('should handle and log errors during save', () => {
        fs.writeFileSync = () => {
            throw new Error('Disk Full');
        };

        const results = [];
        saveHistory(results);

        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0].includes('❌ Error saving history: Disk Full'));
    });
});

// Final cleanup
after(() => {
    fs.existsSync = originalExistsSync;
    fs.mkdirSync = originalMkdirSync;
});
