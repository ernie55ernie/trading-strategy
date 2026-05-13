document.addEventListener('DOMContentLoaded', async () => {
    const goldSellPriceEl = document.getElementById('gold-sell-price');
    const goldBuyPriceEl = document.getElementById('gold-buy-price');
    const tradingSignalBox = document.getElementById('trading-signal-box');
    const tradingSignalEl = document.getElementById('trading-signal');
    const signalReasonsList = document.getElementById('signal-reasons-list');
    const chartLoading = document.getElementById('chart-loading');
    const toggleSma = document.getElementById('toggle-sma');
    const toggleBb = document.getElementById('toggle-bb');

    let chart, areaSeries, rsiSeries, sma20Series, sma50Series, bbUpperSeries, bbLowerSeries;

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

        areaSeries = chart.addAreaSeries({
            lineColor: '#fbbf24',
            topColor: 'rgba(251, 191, 36, 0.4)',
            bottomColor: 'rgba(251, 191, 36, 0.0)',
            lineWidth: 2,
            title: '台銀賣出價',
        });

        sma20Series = chart.addLineSeries({
            color: '#3b82f6',
            lineWidth: 2,
            title: 'SMA 20',
        });

        sma50Series = chart.addLineSeries({
            color: '#10b981',
            lineWidth: 2,
            title: 'SMA 50',
        });

        bbUpperSeries = chart.addLineSeries({
            color: 'rgba(167, 139, 250, 0.6)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            title: 'BB Upper',
        });

        bbLowerSeries = chart.addLineSeries({
            color: 'rgba(167, 139, 250, 0.6)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            title: 'BB Lower',
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
                goldSellPriceEl.textContent = 'Error';
                chartLoading.innerHTML = `<p>Error loading data: ${data.error}</p>`;
            }
        } catch (error) {
            console.error("Error connecting to backend:", error);
        }
    }

    function updateDashboard(data) {
        // Prices
        goldSellPriceEl.textContent = `NT$${data.current_sell_price.toFixed(0)}`;
        goldBuyPriceEl.textContent = `NT$${data.current_buy_price.toFixed(0)}`;

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
        const lineData = data.history.map(item => ({
            time: item.time,
            value: item.value
        }));

        const sma20Data = data.history.filter(i => i.sma_20 !== null).map(item => ({
            time: item.time,
            value: item.sma_20
        }));

        const sma50Data = data.history.filter(i => i.sma_50 !== null).map(item => ({
            time: item.time,
            value: item.sma_50
        }));

        const bbUpperData = data.history.filter(i => i.bb_upper !== null).map(item => ({
            time: item.time,
            value: item.bb_upper
        }));

        const bbLowerData = data.history.filter(i => i.bb_lower !== null).map(item => ({
            time: item.time,
            value: item.bb_lower
        }));

        areaSeries.setData(lineData);
        sma20Series.setData(sma20Data);
        sma50Series.setData(sma50Data);
        bbUpperSeries.setData(bbUpperData);
        bbLowerSeries.setData(bbLowerData);
        
        // Fit content
        chart.timeScale().fitContent();
    }

    toggleSma.addEventListener('change', (e) => {
        const visible = e.target.checked;
        if (sma20Series) sma20Series.applyOptions({ visible });
        if (sma50Series) sma50Series.applyOptions({ visible });
    });

    toggleBb.addEventListener('change', (e) => {
        const visible = e.target.checked;
        if (bbUpperSeries) bbUpperSeries.applyOptions({ visible });
        if (bbLowerSeries) bbLowerSeries.applyOptions({ visible });
    });

    initChart();
    fetchMarketData();
});
