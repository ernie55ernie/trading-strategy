document.addEventListener('DOMContentLoaded', async () => {
    const goldGlobalPriceEl = document.getElementById('gold-global-price');
    const goldSellPriceEl = document.getElementById('gold-sell-price');
    const goldBuyPriceEl = document.getElementById('gold-buy-price');
    const tradingSignalBox = document.getElementById('trading-signal-box');
    const tradingSignalEl = document.getElementById('trading-signal');
    const signalReasonsList = document.getElementById('signal-reasons-list');
    const chartLoading = document.getElementById('chart-loading');
    const toggleSma = document.getElementById('toggle-sma');
    const toggleBb = document.getElementById('toggle-bb');
    const chartLegend = document.getElementById('chart-legend');
    const toggleTbSell = document.getElementById('toggle-tb-sell');
    const toggleBuyPrice = document.getElementById('toggle-buy-price');

    let chart, globalSeries, tbSellSeries, buyPriceSeries, rsiSeries, sma20Series, sma50Series, bbUpperSeries, bbLowerSeries;
    let pbandChart, pbandSeries;
    let chartData = null;

    function updateLegend(param) {
        if (!chartData || chartData.history.length === 0) return;

        let currentItem;
        if (!param || param.time === undefined) {
            currentItem = chartData.history[chartData.history.length - 1];
        } else {
            currentItem = chartData.history.find(item => item.time === param.time);
        }

        if (!currentItem) return;

        let html = `<div style="font-weight: 600; margin-bottom: 4px; color: var(--text-muted);">${currentItem.time}</div>`;
        if (currentItem.global_price) html += `<div class="legend-item"><span class="legend-color" style="background:#fbbf24"></span> <span>倫敦現貨(TWD): ${currentItem.global_price.toFixed(0)}</span></div>`;
        if (currentItem.sell_price !== null && toggleTbSell && toggleTbSell.checked) html += `<div class="legend-item"><span class="legend-color" style="background:#f87171"></span> <span>台銀賣出價: ${currentItem.sell_price.toFixed(0)}</span></div>`;
        if (currentItem.buy_price !== null && toggleBuyPrice && toggleBuyPrice.checked) html += `<div class="legend-item"><span class="legend-color" style="background:#3b82f6"></span> <span>台銀買入價: ${currentItem.buy_price.toFixed(0)}</span></div>`;
        if (currentItem.sma_20 !== null && toggleSma && toggleSma.checked) html += `<div class="legend-item"><span class="legend-color" style="background:#a855f7"></span> <span>SMA 20: ${currentItem.sma_20.toFixed(2)}</span></div>`;
        if (currentItem.sma_50 !== null && toggleSma && toggleSma.checked) html += `<div class="legend-item"><span class="legend-color" style="background:#10b981"></span> <span>SMA 50: ${currentItem.sma_50.toFixed(2)}</span></div>`;
        if (currentItem.bb_upper !== null && toggleBb && toggleBb.checked) html += `<div class="legend-item"><span class="legend-color" style="background:rgba(167, 139, 250, 0.6)"></span> <span>BB Upper: ${currentItem.bb_upper.toFixed(2)}</span></div>`;
        if (currentItem.bb_lower !== null && toggleBb && toggleBb.checked) html += `<div class="legend-item"><span class="legend-color" style="background:rgba(167, 139, 250, 0.6)"></span> <span>BB Lower: ${currentItem.bb_lower.toFixed(2)}</span></div>`;
        if (currentItem.bb_pband !== null && currentItem.bb_pband !== undefined && toggleBb && toggleBb.checked) html += `<div class="legend-item"><span class="legend-color" style="background:rgba(236, 72, 153, 0.6)"></span> <span>%B: ${currentItem.bb_pband.toFixed(2)}</span></div>`;

        chartLegend.innerHTML = html;
    }

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
            leftPriceScale: {
                visible: true,
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            rightPriceScale: {
                visible: false,
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
        };

        chart = LightweightCharts.createChart(document.getElementById('tvchart'), chartProperties);

        globalSeries = chart.addAreaSeries({
            lineColor: '#fbbf24',
            topColor: 'rgba(251, 191, 36, 0.4)',
            bottomColor: 'rgba(251, 191, 36, 0.0)',
            lineWidth: 2,
            title: '倫敦現貨(TWD)',
            lastValueVisible: false,
            priceLineVisible: false,
        });

        tbSellSeries = chart.addLineSeries({
            color: '#f87171',
            lineWidth: 2,
            title: '台銀賣出價',
            lastValueVisible: false,
            priceLineVisible: false,
            visible: false,
        });

        buyPriceSeries = chart.addLineSeries({
            color: '#3b82f6',
            lineWidth: 2,
            title: '台銀買入價',
            lastValueVisible: false,
            priceLineVisible: false,
            visible: false,
        });

        sma20Series = chart.addLineSeries({
            color: '#a855f7',
            lineWidth: 2,
            title: 'SMA 20',
            lastValueVisible: false,
            priceLineVisible: false,
            visible: false,
        });

        sma50Series = chart.addLineSeries({
            color: '#10b981',
            lineWidth: 2,
            title: 'SMA 50',
            lastValueVisible: false,
            priceLineVisible: false,
            visible: false,
        });

        bbUpperSeries = chart.addLineSeries({
            color: 'rgba(167, 139, 250, 0.6)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            title: 'BB Upper',
            lastValueVisible: false,
            priceLineVisible: false,
        });

        bbLowerSeries = chart.addLineSeries({
            color: 'rgba(167, 139, 250, 0.6)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            title: 'BB Lower',
            lastValueVisible: false,
            priceLineVisible: false,
        });

        chart.subscribeCrosshairMove(updateLegend);
        
        // Initialize %B Chart
        const pbandProperties = { 
            ...chartProperties, 
            timeScale: { visible: false, borderColor: 'rgba(255, 255, 255, 0.1)' } 
        };
        pbandChart = LightweightCharts.createChart(document.getElementById('tvchart-pband'), pbandProperties);
        pbandSeries = pbandChart.addLineSeries({
            color: 'rgba(236, 72, 153, 1)',
            lineWidth: 2,
            title: '%B',
            lastValueVisible: true,
            priceLineVisible: false,
        });
        
        pbandSeries.createPriceLine({
            price: 1.0,
            color: 'rgba(239, 68, 68, 0.5)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: false,
            title: '1.0'
        });
        pbandSeries.createPriceLine({
            price: 0.0,
            color: 'rgba(16, 185, 129, 0.5)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: false,
            title: '0.0'
        });

        // Sync Crosshairs
        chart.subscribeCrosshairMove(param => {
            if (param.time) pbandChart.setCrosshairPosition(param.point.x, param.point.y, pbandSeries);
            else pbandChart.clearCrosshairPosition();
        });
        pbandChart.subscribeCrosshairMove(param => {
            if (param.time) chart.setCrosshairPosition(param.point.x, param.point.y, globalSeries);
            else chart.clearCrosshairPosition();
        });
        
        // Sync Time Scale
        chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (range) pbandChart.timeScale().setVisibleLogicalRange(range);
        });
        pbandChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (range) chart.timeScale().setVisibleLogicalRange(range);
        });
        
        // autoSize handles resizing automatically
    }

    async function fetchMarketData(period = '1y') {
        try {
            chartLoading.style.display = 'flex';
            const response = await fetch(`/api/market-data?period=${period}`);
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
        if (goldGlobalPriceEl && data.current_global_price_usd != null) {
            goldGlobalPriceEl.textContent = `$${data.current_global_price_usd.toFixed(2)}`;
        }
        
        const twdEl = document.getElementById('gold-global-price-twd');
        if (twdEl && data.current_global_price != null) {
            twdEl.textContent = `換算台幣: NT$${data.current_global_price.toFixed(0)} / 公克`;
        }
        
        const dxfPriceEl = document.getElementById('dxf-price');
        const dailyRangeEl = document.getElementById('daily-range');
        if (dxfPriceEl) dxfPriceEl.textContent = data.current_dxf != null ? data.current_dxf.toFixed(2) : '--';
        if (dailyRangeEl) {
            if (data.current_gold_low != null && data.current_gold_high != null) {
                dailyRangeEl.textContent = `$${data.current_gold_low.toFixed(2)} - $${data.current_gold_high.toFixed(2)}`;
            } else {
                dailyRangeEl.textContent = '--';
            }
        }
        
        const bbUsdUpperEl = document.getElementById('bb-usd-upper');
        const bbUsdMiddleEl = document.getElementById('bb-usd-middle');
        const bbUsdLowerEl = document.getElementById('bb-usd-lower');
        
        if (bbUsdUpperEl && data.current_bb_usd_upper != null) bbUsdUpperEl.textContent = `$${data.current_bb_usd_upper.toFixed(2)}`;
        if (bbUsdMiddleEl && data.current_bb_usd_middle != null) bbUsdMiddleEl.textContent = `$${data.current_bb_usd_middle.toFixed(2)}`;
        if (bbUsdLowerEl && data.current_bb_usd_lower != null) bbUsdLowerEl.textContent = `$${data.current_bb_usd_lower.toFixed(2)}`;
        goldSellPriceEl.textContent = data.current_sell_price ? `NT$${data.current_sell_price.toFixed(0)}` : '無';
        goldBuyPriceEl.textContent = data.current_buy_price ? `NT$${data.current_buy_price.toFixed(0)}` : '無';

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

        chartData = data;

        // Chart Data
        const globalData = data.history.filter(i => i.global_price !== null).map(item => ({
            time: item.time,
            value: item.global_price
        }));

        const sellPriceData = data.history.filter(i => i.sell_price !== null).map(item => ({
            time: item.time,
            value: item.sell_price
        }));

        const buyPriceData = data.history.filter(i => i.buy_price !== null).map(item => ({
            time: item.time,
            value: item.buy_price
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

        const pbandData = data.history.filter(i => i.bb_pband !== null).map(item => ({
            time: item.time,
            value: item.bb_pband
        }));

        globalSeries.setData(globalData);
        tbSellSeries.setData(sellPriceData);
        buyPriceSeries.setData(buyPriceData);
        sma20Series.setData(sma20Data);
        sma50Series.setData(sma50Data);
        bbUpperSeries.setData(bbUpperData);
        bbLowerSeries.setData(bbLowerData);
        pbandSeries.setData(pbandData);
        
        // Add Markers for historical signals
        const markers = [];
        let lastSignal = "HOLD";
        data.history.forEach(item => {
            if (item.signal === "BUY" && lastSignal !== "BUY") {
                markers.push({ time: item.time, position: 'belowBar', color: '#10b981', shape: 'arrowUp', text: 'BUY' });
            } else if (item.signal === "SELL" && lastSignal !== "SELL") {
                markers.push({ time: item.time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'SELL' });
            }
            lastSignal = item.signal;
        });
        globalSeries.setMarkers(markers);
        
        // Fit content
        chart.timeScale().fitContent();
        pbandChart.timeScale().fitContent();
        
        chartData = data;
        updateLegend(null);
    }

    if (toggleTbSell) {
        toggleTbSell.addEventListener('change', (e) => {
            const visible = e.target.checked;
            if (tbSellSeries) tbSellSeries.applyOptions({ visible });
            updateLegend(null);
        });
    }

    if (toggleBuyPrice) {
        toggleBuyPrice.addEventListener('change', (e) => {
            const visible = e.target.checked;
            if (buyPriceSeries) buyPriceSeries.applyOptions({ visible });
            updateLegend(null);
        });
    }

    toggleSma.addEventListener('change', (e) => {
        const visible = e.target.checked;
        if (sma20Series) sma20Series.applyOptions({ visible });
        if (sma50Series) sma50Series.applyOptions({ visible });
        updateLegend(null);
    });

    toggleBb.addEventListener('change', (e) => {
        const visible = e.target.checked;
        if (bbUpperSeries) bbUpperSeries.applyOptions({ visible });
        if (bbLowerSeries) bbLowerSeries.applyOptions({ visible });
        updateLegend(null);
    });

    const periodButtons = document.querySelectorAll('.control-btn');
    periodButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            periodButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const period = e.target.getAttribute('data-period');
            fetchMarketData(period);
        });
    });

    initChart();
    fetchMarketData();
});
