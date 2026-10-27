document.addEventListener('DOMContentLoaded', async () => {
    const goldGlobalPriceEl = document.getElementById('gold-global-price');
    const goldSellPriceEl = document.getElementById('gold-sell-price');
    const goldBuyPriceEl = document.getElementById('gold-buy-price');
    const tradingSignalBox = document.getElementById('trading-signal-box');
    const tradingSignalEl = document.getElementById('trading-signal');
    const signalReasonsList = document.getElementById('signal-reasons-list');
    const chartLoading = document.getElementById('chart-loading');
    const toggleSma = document.getElementById('toggle-sma');
    const toggleSma200 = document.getElementById('toggle-sma200');
    const toggleBb = document.getElementById('toggle-bb');
    const chartLegend = document.getElementById('chart-legend');
    const toggleTbSell = document.getElementById('toggle-tb-sell');
    const toggleBuyPrice = document.getElementById('toggle-buy-price');

    // rGold Elements
    const rgoldValueEl = document.getElementById('rgold-value');
    const rgoldBadgeEl = document.getElementById('rgold-badge');
    const rgoldMa200UsdEl = document.getElementById('rgold-ma200-usd');
    const rgoldMa200TwdEl = document.getElementById('rgold-ma200-twd');
    const gaugePinEl = document.getElementById('gauge-pin');
    const rgoldCardEl = document.getElementById('rgold-card');
    const rgoldActionCardEl = document.getElementById('rgold-action-card');
    const rgoldStatusDotEl = document.getElementById('rgold-status-dot');
    const rgoldActionTitleEl = document.getElementById('rgold-action-title');
    const rgoldActionDescEl = document.getElementById('rgold-action-desc');
    const alertRgoldItem = document.getElementById('alert-rgold-item');
    const alertRgoldBadge = document.getElementById('alert-rgold-badge');
    const alertRgoldMessage = document.getElementById('alert-rgold-message');

    let chart, globalSeries, tbSellSeries, buyPriceSeries, rsiSeries, sma20Series, sma50Series, sma200Series, bbUpperSeries, bbLowerSeries, volumeSeries;
    let rgoldChart, rgoldSeries;
    let pbandChart, pbandSeries;
    let chartData = null;

    let isLegendCollapsed = false;

    // Attach event listener for the legend toggle button
    if (chartLegend) {
        chartLegend.addEventListener('click', (e) => {
            if (e.target.closest('.legend-toggle-btn')) {
                isLegendCollapsed = !isLegendCollapsed;
                updateLegend(null); // Re-render with current data
            }
        });
    }

    function updateLegend(param) {
        if (!chartData || chartData.history.length === 0) return;

        let currentItem;
        if (!param || param.time === undefined) {
            currentItem = chartData.history[chartData.history.length - 1];
        } else {
            currentItem = chartData.history.find(item => item.time === param.time);
        }

        if (!currentItem) return;

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <div style="font-weight: 600; color: var(--text-muted); padding-right: 12px;">${currentItem.time}</div>
                <button class="legend-toggle-btn" style="pointer-events: auto; background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem; line-height: 1; padding: 0 4px; user-select: none;">${isLegendCollapsed ? '+' : '−'}</button>
            </div>
        `;

        if (!isLegendCollapsed) {
            html += `<div class="legend-items-container" style="display: flex; flex-direction: column; gap: 8px;">`;
            if (currentItem.global_price) html += `<div class="legend-item"><span class="legend-color" style="background:#fbbf24"></span> <span>倫敦現貨(TWD): ${currentItem.global_price.toFixed(0)}</span></div>`;
            if (currentItem.sell_price !== null && toggleTbSell && toggleTbSell.checked) html += `<div class="legend-item"><span class="legend-color" style="background:#f87171"></span> <span>台銀賣出價: ${currentItem.sell_price.toFixed(0)}</span></div>`;
            if (currentItem.buy_price !== null && toggleBuyPrice && toggleBuyPrice.checked) html += `<div class="legend-item"><span class="legend-color" style="background:#3b82f6"></span> <span>台銀買入價: ${currentItem.buy_price.toFixed(0)}</span></div>`;
            if (currentItem.sma_20 !== null && toggleSma && toggleSma.checked) html += `<div class="legend-item"><span class="legend-color" style="background:#a855f7"></span> <span>SMA 20: ${currentItem.sma_20.toFixed(2)}</span></div>`;
            if (currentItem.sma_50 !== null && toggleSma && toggleSma.checked) html += `<div class="legend-item"><span class="legend-color" style="background:#10b981"></span> <span>SMA 50: ${currentItem.sma_50.toFixed(2)}</span></div>`;
            if (currentItem.sma_200 !== null && currentItem.sma_200 !== undefined && toggleSma200 && toggleSma200.checked) html += `<div class="legend-item"><span class="legend-color" style="background:#f59e0b"></span> <span>SMA 200 (年線): ${currentItem.sma_200.toFixed(2)}</span></div>`;
            if (currentItem.bb_upper !== null && toggleBb && toggleBb.checked) html += `<div class="legend-item"><span class="legend-color" style="background:rgba(167, 139, 250, 0.6)"></span> <span>BB Upper: ${currentItem.bb_upper.toFixed(2)}</span></div>`;
            if (currentItem.bb_lower !== null && toggleBb && toggleBb.checked) html += `<div class="legend-item"><span class="legend-color" style="background:rgba(167, 139, 250, 0.6)"></span> <span>BB Lower: ${currentItem.bb_lower.toFixed(2)}</span></div>`;
            if (currentItem.rgold !== null && currentItem.rgold !== undefined) {
                let rgoldColor = '#38bdf8';
                let tag = '';
                if (currentItem.rgold >= 1.25) {
                    rgoldColor = '#ef4444';
                    tag = ' (🚨 逃頂警報)';
                } else if (currentItem.rgold >= 1.20) {
                    rgoldColor = '#f59e0b';
                    tag = ' (⚠️ 警戒)';
                } else if (currentItem.rgold >= 1.10) {
                    rgoldColor = '#10b981';
                    tag = ' (🟢 健康牛市)';
                }
                html += `<div class="legend-item"><span class="legend-color" style="background:${rgoldColor}"></span> <span>rGold: ${currentItem.rgold.toFixed(3)}${tag}</span></div>`;
            }
            if (currentItem.bb_pband !== null && currentItem.bb_pband !== undefined && toggleBb && toggleBb.checked) html += `<div class="legend-item"><span class="legend-color" style="background:rgba(236, 72, 153, 0.6)"></span> <span>%B: ${currentItem.bb_pband.toFixed(2)}</span></div>`;
            if (currentItem.volume !== undefined && currentItem.volume > 0) html += `<div class="legend-item"><span class="legend-color" style="background:#60a5fa"></span> <span>成交量: ${currentItem.volume.toLocaleString()}</span></div>`;
            html += `</div>`;
        }

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
                visible: true,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                scaleMargins: {
                    top: 0.8,
                    bottom: 0,
                },
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
            priceScaleId: 'left',
        });

        tbSellSeries = chart.addLineSeries({
            color: '#f87171',
            lineWidth: 2,
            title: '台銀賣出價',
            lastValueVisible: false,
            priceLineVisible: false,
            visible: false,
            priceScaleId: 'left',
        });

        buyPriceSeries = chart.addLineSeries({
            color: '#3b82f6',
            lineWidth: 2,
            title: '台銀買入價',
            lastValueVisible: false,
            priceLineVisible: false,
            visible: false,
            priceScaleId: 'left',
        });

        sma20Series = chart.addLineSeries({
            color: '#a855f7',
            lineWidth: 2,
            title: 'SMA 20',
            lastValueVisible: false,
            priceLineVisible: false,
            visible: false,
            priceScaleId: 'left',
        });

        sma50Series = chart.addLineSeries({
            color: '#10b981',
            lineWidth: 2,
            title: 'SMA 50',
            lastValueVisible: false,
            priceLineVisible: false,
            visible: false,
            priceScaleId: 'left',
        });

        sma200Series = chart.addLineSeries({
            color: '#f59e0b',
            lineWidth: 2,
            title: 'SMA 200 (年線)',
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
            priceScaleId: 'left',
        });

        bbLowerSeries = chart.addLineSeries({
            color: 'rgba(167, 139, 250, 0.6)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            title: 'BB Lower',
            lastValueVisible: false,
            priceLineVisible: false,
            priceScaleId: 'left',
        });

        volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: 'right', // use the right scale which we configured to be at the bottom 20%
        });

        chart.subscribeCrosshairMove(updateLegend);
        
        // Initialize rGold Chart (Relative Gold Ratio)
        const rgoldProperties = { 
            ...chartProperties, 
            timeScale: { visible: false, borderColor: 'rgba(255, 255, 255, 0.1)' } 
        };
        rgoldChart = LightweightCharts.createChart(document.getElementById('tvchart-rgold'), rgoldProperties);
        rgoldSeries = rgoldChart.addLineSeries({
            color: '#fbbf24',
            lineWidth: 2,
            title: 'rGold',
            lastValueVisible: true,
            priceLineVisible: false,
        });

        // 1.25 Red Alert Line (逃頂保命線)
        rgoldSeries.createPriceLine({
            price: 1.25,
            color: 'rgba(239, 68, 68, 0.9)',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: '1.25 🚨 逃頂保命線'
        });

        // 1.15 Healthy Bull Market Line (健康牛市線)
        rgoldSeries.createPriceLine({
            price: 1.15,
            color: 'rgba(16, 185, 129, 0.85)',
            lineWidth: 1.5,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: '1.15 🟢 健康牛市'
        });

        // 1.00 200-day Moving Average Baseline
        rgoldSeries.createPriceLine({
            price: 1.00,
            color: 'rgba(148, 163, 184, 0.5)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            axisLabelVisible: true,
            title: '1.00 年線'
        });

        // Initialize %B Chart
        const pbandProperties = { 
            ...chartProperties, 
            timeScale: { visible: false, borderColor: 'rgba(255, 255, 255, 0.1)' },
            rightPriceScale: {
                visible: true,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                scaleMargins: { top: 0.1, bottom: 0.1 }
            },
            leftPriceScale: {
                visible: false
            }
        };
        pbandChart = LightweightCharts.createChart(document.getElementById('tvchart-pband'), pbandProperties);
        pbandSeries = pbandChart.addLineSeries({
            color: 'rgba(236, 72, 153, 1)',
            lineWidth: 2,
            title: '%B',
            lastValueVisible: true,
            priceLineVisible: false,
            priceScaleId: 'right',
            autoscaleInfoProvider: () => ({
                priceRange: {
                    minValue: 0.0,
                    maxValue: 2.0,
                },
            }),
        });
        
        pbandSeries.createPriceLine({
            price: 1.5,
            color: 'rgba(255, 255, 255, 0.2)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: false,
            title: '1.5'
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
            price: 0.5,
            color: 'rgba(255, 255, 255, 0.2)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: false,
            title: '0.5'
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
            if (param.time) {
                if (rgoldChart && rgoldSeries) rgoldChart.setCrosshairPosition(param.point.x, param.point.y, rgoldSeries);
                if (pbandChart && pbandSeries) pbandChart.setCrosshairPosition(param.point.x, param.point.y, pbandSeries);
            } else {
                if (rgoldChart) rgoldChart.clearCrosshairPosition();
                if (pbandChart) pbandChart.clearCrosshairPosition();
            }
        });
        rgoldChart.subscribeCrosshairMove(param => {
            if (param.time) {
                chart.setCrosshairPosition(param.point.x, param.point.y, globalSeries);
                if (pbandChart && pbandSeries) pbandChart.setCrosshairPosition(param.point.x, param.point.y, pbandSeries);
            } else {
                chart.clearCrosshairPosition();
                if (pbandChart) pbandChart.clearCrosshairPosition();
            }
            updateLegend(param);
        });
        pbandChart.subscribeCrosshairMove(param => {
            if (param.time) {
                chart.setCrosshairPosition(param.point.x, param.point.y, globalSeries);
                if (rgoldChart && rgoldSeries) rgoldChart.setCrosshairPosition(param.point.x, param.point.y, rgoldSeries);
            } else {
                chart.clearCrosshairPosition();
                if (rgoldChart) rgoldChart.clearCrosshairPosition();
            }
            updateLegend(param);
        });
        
        // Sync Time Scale
        chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (range) {
                if (rgoldChart) rgoldChart.timeScale().setVisibleLogicalRange(range);
                if (pbandChart) pbandChart.timeScale().setVisibleLogicalRange(range);
            }
        });
        rgoldChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (range) {
                chart.timeScale().setVisibleLogicalRange(range);
                if (pbandChart) pbandChart.timeScale().setVisibleLogicalRange(range);
            }
        });
        pbandChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (range) {
                chart.timeScale().setVisibleLogicalRange(range);
                if (rgoldChart) rgoldChart.timeScale().setVisibleLogicalRange(range);
            }
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
        const dataSourceValueEl = document.getElementById('data-source-value');
        if (dataSourceValueEl && data.data_source) {
            let label = data.data_source;
            if (label === 'XAUUSD=X') label += ' (現貨)';
            else if (label === 'GC=F') label += ' (期貨)';
            else if (label === 'PAXG-USD') label += ' (代幣)';
            dataSourceValueEl.textContent = label;
        }
        
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

        // Relative Gold Ratio (rGold) Thermometer & Card
        if (data.current_rgold != null) {
            const rg = data.current_rgold;
            if (rgoldValueEl) rgoldValueEl.textContent = rg.toFixed(3);

            if (rgoldMa200UsdEl) {
                rgoldMa200UsdEl.textContent = data.current_sma_200_usd != null ? `$${data.current_sma_200_usd.toFixed(2)}` : '--';
            }
            if (rgoldMa200TwdEl) {
                rgoldMa200TwdEl.textContent = data.current_sma_200 != null ? `NT$${data.current_sma_200.toFixed(0)} / g` : '--';
            }

            // Gauge needle position: mapping 0.90 -> 1.30 to 2% -> 98%
            const minScale = 0.90;
            const maxScale = 1.30;
            let gaugePct = ((rg - minScale) / (maxScale - minScale)) * 100;
            gaugePct = Math.max(2, Math.min(98, gaugePct));
            if (gaugePinEl) {
                gaugePinEl.style.left = `${gaugePct}%`;
            }

            // Status Badge & Action Box Styling & Content
            if (rgoldCardEl) {
                rgoldCardEl.classList.remove('state-alarm', 'state-warning', 'state-healthy', 'state-normal', 'state-under');
            }
            if (rgoldActionCardEl) {
                rgoldActionCardEl.classList.remove('status-alarm', 'status-warning', 'status-healthy', 'status-normal', 'status-under');
            }

            if (rg >= 1.25) {
                if (rgoldCardEl) rgoldCardEl.classList.add('state-alarm');
                if (rgoldActionCardEl) rgoldActionCardEl.classList.add('status-alarm');
                if (rgoldBadgeEl) {
                    rgoldBadgeEl.textContent = '🚨 紅色警報區';
                    rgoldBadgeEl.className = 'rgold-badge badge-alarm';
                }
                if (rgoldActionTitleEl) rgoldActionTitleEl.textContent = '🚨 機構逃頂信號 · 極度狂熱';
                if (rgoldActionDescEl) {
                    rgoldActionDescEl.innerHTML = '<strong>你的唯一動作：跑！或者至少執行「倒金字塔減倉」，把一半的貨先賣了再說！</strong> 記住 1.25 是保命線，價格已遠遠跑在價值前面，屬於機構收割與被收割的分界線。<br><span style="font-size:0.75rem; color:#fca5a5;">（歷史案例：2026年1月暴跌前夕 rGold 飆升至 1.266）</span>';
                }
                if (alertRgoldItem) {
                    alertRgoldItem.style.display = 'block';
                    alertRgoldItem.className = 'alert-item alert-rgold-alarm';
                    if (alertRgoldBadge) alertRgoldBadge.textContent = '🚨 逃頂警報';
                    if (alertRgoldMessage) {
                        alertRgoldMessage.innerHTML = `<strong>rGold 相對黃金比率高達 ${rg.toFixed(3)}（衝破 1.25 保命線）！</strong> 機構已進入收割警戒區，強烈建議執行倒金字塔減倉！`;
                    }
                }
            } else if (rg >= 1.20) {
                if (rgoldCardEl) rgoldCardEl.classList.add('state-warning');
                if (rgoldActionCardEl) rgoldActionCardEl.classList.add('status-warning');
                if (rgoldBadgeEl) {
                    rgoldBadgeEl.textContent = '⚠️ 升溫警戒';
                    rgoldBadgeEl.className = 'rgold-badge badge-warning';
                }
                if (rgoldActionTitleEl) rgoldActionTitleEl.textContent = '⚠️ 逼近 1.25 警戒線';
                if (rgoldActionDescEl) {
                    rgoldActionDescEl.innerHTML = '金價超過年線 20% 以上，指標快速攀升逼近 1.25 紅色警報線。切忌追高盲目加倉，宜提前擬定減倉預案。';
                }
                if (alertRgoldItem) {
                    alertRgoldItem.style.display = 'block';
                    alertRgoldItem.className = 'alert-item alert-rgold-warn';
                    if (alertRgoldBadge) alertRgoldBadge.textContent = '⚠️ 升溫提醒';
                    if (alertRgoldMessage) {
                        alertRgoldMessage.innerHTML = `rGold 達 ${rg.toFixed(3)}，正逼近 1.25 逃頂保命線，留意高檔震盪與回調風險。`;
                    }
                }
            } else if (rg >= 1.10) {
                if (rgoldCardEl) rgoldCardEl.classList.add('state-healthy');
                if (rgoldActionCardEl) rgoldActionCardEl.classList.add('status-healthy');
                if (rgoldBadgeEl) {
                    rgoldBadgeEl.textContent = '🟢 健康牛市區';
                    rgoldBadgeEl.className = 'rgold-badge badge-healthy';
                }
                if (rgoldActionTitleEl) rgoldActionTitleEl.textContent = '🟢 約 1.15 健康牛市區';
                if (rgoldActionDescEl) {
                    rgoldActionDescEl.innerHTML = '金價超過年線約 15%，市場結構健康，趨勢強勁且未見過熱跡象，可順勢持有核心部位。';
                }
                if (alertRgoldItem) {
                    alertRgoldItem.style.display = 'block';
                    alertRgoldItem.className = 'alert-item alert-rgold-healthy';
                    if (alertRgoldBadge) alertRgoldBadge.textContent = '🟢 牛市健康';
                    if (alertRgoldMessage) {
                        alertRgoldMessage.innerHTML = `rGold 為 ${rg.toFixed(3)}，處於健康牛市區（約 1.15），金價多頭結構健康。`;
                    }
                }
            } else if (rg >= 1.00) {
                if (rgoldCardEl) rgoldCardEl.classList.add('state-normal');
                if (rgoldActionCardEl) rgoldActionCardEl.classList.add('status-normal');
                if (rgoldBadgeEl) {
                    rgoldBadgeEl.textContent = '🔵 常態偏多';
                    rgoldBadgeEl.className = 'rgold-badge badge-normal';
                }
                if (rgoldActionTitleEl) rgoldActionTitleEl.textContent = '🔵 溫和常態多頭';
                if (rgoldActionDescEl) {
                    rgoldActionDescEl.innerHTML = '金價高於 200 日年線（長線多空分界線），處於常態偏多格局。';
                }
                if (alertRgoldItem) alertRgoldItem.style.display = 'none';
            } else {
                if (rgoldCardEl) rgoldCardEl.classList.add('state-under');
                if (rgoldActionCardEl) rgoldActionCardEl.classList.add('status-under');
                if (rgoldBadgeEl) {
                    rgoldBadgeEl.textContent = '⚪ 年線下方';
                    rgoldBadgeEl.className = 'rgold-badge badge-under';
                }
                if (rgoldActionTitleEl) rgoldActionTitleEl.textContent = '💡 長線價值/修正區';
                if (rgoldActionDescEl) {
                    rgoldActionDescEl.innerHTML = '金價跌破 200 日年線，長線趨勢偏弱或進入深蹲修正期，具備長期配置價值，避免恐慌殺跌。';
                }
                if (alertRgoldItem) alertRgoldItem.style.display = 'none';
            }
        }

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

        const sma200Data = data.history.filter(i => i.sma_200 !== null && i.sma_200 !== undefined).map(item => ({
            time: item.time,
            value: item.sma_200
        }));

        const bbUpperData = data.history.filter(i => i.bb_upper !== null).map(item => ({
            time: item.time,
            value: item.bb_upper
        }));

        const bbLowerData = data.history.filter(i => i.bb_lower !== null).map(item => ({
            time: item.time,
            value: item.bb_lower
        }));

        const rgoldData = data.history.filter(i => i.rgold !== null && i.rgold !== undefined).map(item => ({
            time: item.time,
            value: item.rgold
        }));

        const pbandData = data.history.filter(i => i.bb_pband !== null).map(item => ({
            time: item.time,
            value: item.bb_pband
        }));

        const volumeData = data.history.map((item, index) => {
            let color = 'rgba(38, 166, 154, 0.5)'; // default green
            if (index > 0 && data.history[index].global_price < data.history[index-1].global_price) {
                color = 'rgba(239, 83, 80, 0.5)'; // red if price went down
            }
            return {
                time: item.time,
                value: item.volume !== undefined ? item.volume : 0,
                color: color
            };
        });

        globalSeries.setData(globalData);
        tbSellSeries.setData(sellPriceData);
        buyPriceSeries.setData(buyPriceData);
        sma20Series.setData(sma20Data);
        sma50Series.setData(sma50Data);
        if (sma200Series) sma200Series.setData(sma200Data);
        bbUpperSeries.setData(bbUpperData);
        bbLowerSeries.setData(bbLowerData);
        if (rgoldSeries) rgoldSeries.setData(rgoldData);
        pbandSeries.setData(pbandData);
        volumeSeries.setData(volumeData);
        
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
        if (rgoldChart) rgoldChart.timeScale().fitContent();
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

    if (toggleSma200) {
        toggleSma200.addEventListener('change', (e) => {
            const visible = e.target.checked;
            if (sma200Series) sma200Series.applyOptions({ visible });
            updateLegend(null);
        });
    }

    toggleBb.addEventListener('change', (e) => {
        const visible = e.target.checked;
        if (bbUpperSeries) bbUpperSeries.applyOptions({ visible });
        if (bbLowerSeries) bbLowerSeries.applyOptions({ visible });
        updateLegend(null);
    });

    // Subchart switcher tabs
    const subtabBtns = document.querySelectorAll('.subtab-btn');
    const subchartRgoldPanel = document.getElementById('subchart-rgold-panel');
    const subchartPbandPanel = document.getElementById('subchart-pband-panel');

    subtabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            subtabBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const view = e.target.getAttribute('data-view') || e.target.getAttribute('data-sub');
            if (view === 'all' || view === 'both') {
                if (subchartRgoldPanel) subchartRgoldPanel.style.display = 'block';
                if (subchartPbandPanel) subchartPbandPanel.style.display = 'block';
            } else if (view === 'rgold') {
                if (subchartRgoldPanel) subchartRgoldPanel.style.display = 'block';
                if (subchartPbandPanel) subchartPbandPanel.style.display = 'none';
            } else if (view === 'pband') {
                if (subchartRgoldPanel) subchartRgoldPanel.style.display = 'none';
                if (subchartPbandPanel) subchartPbandPanel.style.display = 'block';
            }
            if (rgoldChart) rgoldChart.timeScale().fitContent();
            if (pbandChart) pbandChart.timeScale().fitContent();
        });
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
