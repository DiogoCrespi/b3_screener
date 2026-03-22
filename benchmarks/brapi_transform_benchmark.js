
const BrapiStockAdapter = require('../services/adapters/brapi-stock-adapter');
const { performance } = require('perf_hooks');

const adapter = new BrapiStockAdapter();

function runBenchmark(numStocks) {
    // Mock data
    const mockStocks = Array.from({ length: numStocks }, (_, i) => ({
        symbol: `TEST${i}`,
        regularMarketPrice: 10.0,
        summaryProfile: {
            trailingPE: 5.5,
            priceToBook: 1.2,
            dividendYield: 0.05
        }
    }));

    function benchmarkCurrent(results) {
        const start = performance.now();
        const output = results.map(stock => adapter.transformStock(stock)).filter(s => s !== null);
        const end = performance.now();
        return { time: end - start, length: output.length };
    }

    function benchmarkOptimized(results) {
        const start = performance.now();
        const output = [];
        for (const stock of results) {
            const transformed = adapter.transformStock(stock);
            if (transformed !== null) {
                output.push(transformed);
            }
        }
        const end = performance.now();
        return { time: end - start, length: output.length };
    }

    console.log(`\nBenchmarking with ${numStocks} stocks...`);

    // Warm up
    benchmarkCurrent(mockStocks);
    benchmarkOptimized(mockStocks);

    const iterations = 1000;
    let totalCurrentTime = 0;
    let totalOptimizedTime = 0;

    for (let i = 0; i < iterations; i++) {
        totalCurrentTime += benchmarkCurrent(mockStocks).time;
        totalOptimizedTime += benchmarkOptimized(mockStocks).time;
    }

    console.log(`Average Current Time: ${(totalCurrentTime / iterations).toFixed(4)}ms`);
    console.log(`Average Optimized Time: ${(totalOptimizedTime / iterations).toFixed(4)}ms`);
    console.log(`Improvement: ${(((totalCurrentTime - totalOptimizedTime) / totalCurrentTime) * 100).toFixed(2)}%`);
}

runBenchmark(500);
runBenchmark(10000);
