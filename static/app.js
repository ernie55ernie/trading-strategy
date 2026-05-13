document.addEventListener('DOMContentLoaded', async () => {
    const goldUsdPriceEl = document.getElementById('gold-usd-price');
    const goldTwdPriceEl = document.getElementById('gold-twd-price');
    const usdTwdRateEl = document.getElementById('usd-twd-rate');
    const tradingSignalBox = document.getElementById('trading-signal-box');
    const tradingSignalEl = document.getElementById('trading-signal');
    const signalReasonsList = document.getElementById('signal-reasons-list');
    const chartLoading = document.getElementById('chart-loading');

    let chart, candlestickSeries, rsiSeries, sma20Series, sma50Series;

    function initChart() {
        const chartProperties = {
            autoSize: true,
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#94a3b8',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
        };

        chart = LightweightCharts.createChart(document.getElementById('tvchart'), chartProperties);

        candlestickSeries = chart.addCandlestickSeries({
            upColor: '#10b981',
            downColor: '#ef4444',
            borderDownColor: '#ef4444',
            borderUpColor: '#10b981',
            wickDownColor: '#ef4444',
            wickUpColor: '#10b981',
        });

        sma20Series = chart.addLineSeries({
            color: '#3b82f6',
            lineWidth: 2,
            title: 'SMA 20',
        });

        sma50Series = chart.addLineSeries({
            color: '#fbbf24',
            lineWidth: 2,
            title: 'SMA 50',
        });

        // autoSize handles resizing automatically
    }

    async function fetchMarketData() {
        try {
            const response = await fetch('/api/market-data?period=1y');
            const data = await response.json();
            
            if (data.status === 'success') {
                updateDashboard(data);
                chartLoading.style.display = 'none';
            } else {
                console.error("Failed to fetch data:", data.error);
                goldUsdPriceEl.textContent = 'Error';
                chartLoading.innerHTML = `<p>Error loading data: ${data.error}</p>`;
            }
        } catch (error) {
            console.error("Error connecting to backend:", error);
        }
    }

    function updateDashboard(data) {
        // Prices
        goldUsdPriceEl.textContent = `$${data.current_price_usd.toFixed(2)}`;
        goldTwdPriceEl.textContent = `NT$${data.current_price_twd.toFixed(2)}`;
        usdTwdRateEl.textContent = data.exchange_rate.toFixed(4);

        // Trading Signal
        tradingSignalEl.textContent = data.signal;
        tradingSignalBox.setAttribute('data-signal', data.signal);

        // Reasons
        signalReasonsList.innerHTML = '';
        data.reasons.forEach(reason => {
            const li = document.createElement('li');
            li.textContent = reason;
            signalReasonsList.appendChild(li);
        });

        // Chart Data
        const candleData = data.history.map(item => ({
            time: item.time,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close
        }));

        const sma20Data = data.history.filter(i => i.sma_20 !== null).map(item => ({
            time: item.time,
            value: item.sma_20
        }));

        const sma50Data = data.history.filter(i => i.sma_50 !== null).map(item => ({
            time: item.time,
            value: item.sma_50
        }));

        candlestickSeries.setData(candleData);
        sma20Series.setData(sma20Data);
        sma50Series.setData(sma50Data);
        
        // Fit content
        chart.timeScale().fitContent();
    }

    initChart();
    fetchMarketData();
});
