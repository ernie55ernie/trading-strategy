import logging
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import ta
import math
import numpy as np
import requests
import yfinance as yf
from datetime import datetime, timedelta
from io import StringIO
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="XAU/USD Trading Strategy API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the static directory
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return FileResponse("static/index.html")

@app.get("/api/market-data")
def get_market_data(period: str = "1y"):
    try:
        tb_df = pd.DataFrame(columns=['date', 'buy_price', 'sell_price'])
        try:
            url = 'https://rate.bot.com.tw/gold/chart/year/TWD'
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code == 200:
                dfs = pd.read_html(StringIO(res.text))
                if dfs:
                    raw_tb = dfs[0]
                    if len(raw_tb.columns) >= 5:
                        raw_tb.columns = ['date', 'currency', 'weight', 'buy_price', 'sell_price']
                        raw_tb['date'] = pd.to_datetime(raw_tb['date']).dt.tz_localize(None)
                        raw_tb = raw_tb.sort_values(by='date').reset_index(drop=True)
                        tb_df = raw_tb[['date', 'buy_price', 'sell_price']]
        except Exception as tb_err:
            logger.warning(f"Could not fetch or parse Taiwan Bank gold data: {tb_err}")
            
        days_map = {"1m": 30, "3m": 90, "6m": 180, "1y": 365, "3y": 365 * 3, "5y": 365 * 5, "10y": 365 * 10}
        target_days = days_map.get(period, 365)
        
        # Always fetch at least (target_days + 350) days to ensure enough data points for 200-day SMA (rGold)
        fetch_days = max(target_days + 350, 400)
        
        if not tb_df.empty and pd.notna(tb_df['date'].max()):
            end_date = tb_df['date'].max() + timedelta(days=1)
        else:
            end_date = datetime.now() + timedelta(days=1)
            
        fetch_start_date = end_date - timedelta(days=fetch_days)
        display_start_date = end_date - timedelta(days=target_days)
        
        # Try fetching international gold price data with fallbacks
        tickers_to_try = ['XAUUSD=X', 'GC=F', 'PAXG-USD']
        global_gold = None
        gold_ticker = None
        
        max_retries = 3
        for attempt in range(max_retries):
            for t in tickers_to_try:
                temp_df = yf.download(t, start=fetch_start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'), progress=False)
                if not temp_df.empty:
                    global_gold = temp_df
                    gold_ticker = t
                    break
            
            twd = yf.download('TWD=X', start=fetch_start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'), progress=False)
            dxf = yf.download('DX-Y.NYB', start=fetch_start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'), progress=False)
            
            if global_gold is not None and not global_gold.empty and not twd.empty:
                break
                
            time.sleep(1)
        
        if global_gold is None or twd.empty:
            return {"error": "Failed to fetch global market data."}
            
        try:
            global_price_series = global_gold['Close'][gold_ticker]
        except KeyError:
            global_price_series = global_gold['Close']
            
        try:
            if 'Volume' in global_gold.columns:
                try:
                    volume_series = global_gold['Volume'][gold_ticker]
                except KeyError:
                    volume_series = global_gold['Volume']
            else:
                volume_series = pd.Series(0, index=global_price_series.index)
        except Exception:
            volume_series = pd.Series(0, index=global_price_series.index)

        try:
            twd_series = twd['Close']['TWD=X']
        except KeyError:
            twd_series = twd['Close']
            
        df = pd.DataFrame({
            'global_price': global_price_series,
            'volume': volume_series,
            'usd_twd': twd_series
        }).dropna(subset=['global_price', 'usd_twd'])
        df['volume'] = df['volume'].fillna(0)
        
        df['global_twd_price'] = (df['global_price'] / 31.1034768) * df['usd_twd']
        df = df.reset_index()
        df.rename(columns={'Date': 'date'}, inplace=True)
        df['date'] = pd.to_datetime(df['date']).dt.tz_localize(None)
        
        df = pd.merge(df, tb_df, on='date', how='left')
        
        # Core change: use international price as the 'close' price for TA indicators
        df['close'] = df['global_twd_price']
        
        df['rsi'] = ta.momentum.RSIIndicator(close=df['close'], window=14).rsi()
        macd = ta.trend.MACD(close=df['close'])
        df['macd'] = macd.macd()
        df['macd_signal'] = macd.macd_signal()
        df['macd_diff'] = macd.macd_diff()
        df['sma_20'] = ta.trend.SMAIndicator(close=df['close'], window=20).sma_indicator()
        df['sma_50'] = ta.trend.SMAIndicator(close=df['close'], window=50).sma_indicator()
        df['sma_200'] = ta.trend.SMAIndicator(close=df['close'], window=200).sma_indicator()
        
        indicator_bb = ta.volatility.BollingerBands(close=df['close'], window=20, window_dev=2)
        df['bb_bbh'] = indicator_bb.bollinger_hband()
        df['bb_bbl'] = indicator_bb.bollinger_lband()
        df['bb_pband'] = indicator_bb.bollinger_pband()
        
        indicator_bb_usd = ta.volatility.BollingerBands(close=df['global_price'], window=20, window_dev=2)
        df['bb_usd_hband'] = indicator_bb_usd.bollinger_hband()
        df['bb_usd_lband'] = indicator_bb_usd.bollinger_lband()
        df['sma_20_usd'] = ta.trend.SMAIndicator(close=df['global_price'], window=20).sma_indicator()
        df['sma_200_usd'] = ta.trend.SMAIndicator(close=df['global_price'], window=200).sma_indicator()
        
        # rGold = 現在的金價 ÷ 200天移動平均線 (Current Gold Price / 200 MA)
        df['rgold'] = np.where(
            (pd.notna(df['sma_200_usd'])) & (df['sma_200_usd'] > 0),
            df['global_price'] / df['sma_200_usd'],
            np.nan
        )
        
        df.dropna(subset=['sma_50', 'bb_bbh'], inplace=True)
        df = df[df['date'] >= display_start_date].reset_index(drop=True)
        
        if df.empty:
             return {"error": "Not enough data points after indicator calculation."}
             
        latest = df.iloc[-1]
        signal = "HOLD"
        signal_reasons = []
        
        # rGold 相對黃金比率評估 (逃頂保命線 1.25 / 健康牛市區 ~1.15)
        current_rgold = float(latest['rgold']) if pd.notna(latest['rgold']) else None
        if current_rgold is not None:
            if current_rgold >= 1.25:
                signal_reasons.append(f"🚨 rGold 相對黃金比率高達 {current_rgold:.3f}（衝破 1.25 紅色警報區！機構逃頂極度狂熱信號，價格遠遠跑在價值前面，建議倒金字塔減倉或離場觀望）")
            elif current_rgold >= 1.20:
                signal_reasons.append(f"⚠️ rGold 相對黃金比率達 {current_rgold:.3f}（逼近 1.25 逃頂警戒線，市場偏熱，留意追高風險）")
            elif current_rgold >= 1.10:
                signal_reasons.append(f"🟢 rGold 相對黃金比率為 {current_rgold:.3f}（處於約 1.15 健康牛市區，金價超年線 10~20%，市場結構良好）")
            elif current_rgold >= 1.00:
                signal_reasons.append(f"ℹ️ rGold 相對黃金比率為 {current_rgold:.3f}（金價位於 200 日年線上方，維持長線偏多格局）")
            else:
                signal_reasons.append(f"💡 rGold 相對黃金比率為 {current_rgold:.3f}（金價跌破 200 日年線，處於長線修正/價值低估區）")
        
        if latest['rsi'] > 70:
            signal_reasons.append("RSI 處於超買區 (>70)")
        elif latest['rsi'] < 30:
            signal_reasons.append("RSI 處於超賣區 (<30)")
            
        if latest['macd_diff'] > 0 and df.iloc[-2]['macd_diff'] <= 0:
            signal_reasons.append("MACD 黃金交叉 (Bullish Cross)")
        elif latest['macd_diff'] < 0 and df.iloc[-2]['macd_diff'] >= 0:
            signal_reasons.append("MACD 死亡交叉 (Bearish Cross)")
            
        if latest['sma_20'] > latest['sma_50'] and df.iloc[-2]['sma_20'] <= df.iloc[-2]['sma_50']:
             signal_reasons.append("均線黃金交叉 (SMA20 > SMA50)")
        elif latest['sma_20'] < latest['sma_50'] and df.iloc[-2]['sma_20'] >= df.iloc[-2]['sma_50']:
             signal_reasons.append("均線死亡交叉 (SMA20 < SMA50)")
             
        if latest['close'] > latest['bb_bbh']:
             signal_reasons.append("價格突破布林帶上軌 (超買)")
        elif latest['close'] < latest['bb_bbl']:
             signal_reasons.append("價格跌破布林帶下軌 (超賣)")
             
        if latest['bb_pband'] >= 0.80:
             signal_reasons.append("Bollinger Bands %B ≥ 0.80 (出場參考)")
        elif latest['bb_pband'] <= 0.20:
             signal_reasons.append("Bollinger Bands %B ≤ 0.20 (進場參考)")
             
        bullish_points = sum([1 for r in signal_reasons if "超賣" in r or "黃金" in r or "進場" in r or "健康牛市" in r])
        bearish_points = sum([1 for r in signal_reasons if "超買" in r or "死亡" in r or "出場" in r or "警報" in r or "逃頂" in r or "過熱" in r])
        
        if current_rgold is not None and current_rgold >= 1.25:
            # Overrides to urgent SELL / ESCAPE signal
            signal = "SELL"
        elif bullish_points > bearish_points:
            signal = "BUY"
        elif bearish_points > bullish_points:
            signal = "SELL"
            
        if not signal_reasons:
            signal_reasons.append("目前無強烈技術指標訊號。")

        records = []
        for i in range(len(df)):
            row = df.iloc[i]
            
            hist_signal = "HOLD"
            bullish = 0
            bearish = 0
            
            if pd.notna(row['rsi']):
                if row['rsi'] > 70: bearish += 1
                elif row['rsi'] < 30: bullish += 1
                
            if i > 0:
                prev = df.iloc[i-1]
                if pd.notna(row['macd_diff']) and pd.notna(prev['macd_diff']):
                    if row['macd_diff'] > 0 and prev['macd_diff'] <= 0: bullish += 1
                    elif row['macd_diff'] < 0 and prev['macd_diff'] >= 0: bearish += 1
                if pd.notna(row['sma_20']) and pd.notna(row['sma_50']) and pd.notna(prev['sma_20']) and pd.notna(prev['sma_50']):
                    if row['sma_20'] > row['sma_50'] and prev['sma_20'] <= prev['sma_50']: bullish += 1
                    elif row['sma_20'] < row['sma_50'] and prev['sma_20'] >= prev['sma_50']: bearish += 1
                    
            if pd.notna(row['bb_bbh']):
                if row['close'] > row['bb_bbh']: bearish += 1
                elif row['close'] < row['bb_bbl']: bullish += 1
                
            if pd.notna(row['bb_pband']):
                if row['bb_pband'] >= 0.80: bearish += 1
                elif row['bb_pband'] <= 0.20: bullish += 1
                
            if pd.notna(row['rgold']):
                if row['rgold'] >= 1.25: bearish += 2
                elif 1.10 <= row['rgold'] <= 1.20: bullish += 1

            if bullish > bearish: hist_signal = "BUY"
            elif bearish > bullish: hist_signal = "SELL"

            records.append({
                "time": row['date'].strftime('%Y-%m-%d'),
                "global_price": float(row['global_twd_price']),
                "volume": float(row['volume']) if pd.notna(row['volume']) else 0.0,
                "buy_price": float(row['buy_price']) if pd.notna(row['buy_price']) else None,
                "sell_price": float(row['sell_price']) if pd.notna(row['sell_price']) else None,
                "value": float(row['global_twd_price']), # for primary global series mapping
                "rsi": float(row['rsi']) if not math.isnan(row['rsi']) else None,
                "macd": float(row['macd']) if not math.isnan(row['macd']) else None,
                "macd_signal": float(row['macd_signal']) if not math.isnan(row['macd_signal']) else None,
                "macd_hist": float(row['macd_diff']) if not math.isnan(row['macd_diff']) else None,
                "sma_20": float(row['sma_20']) if not math.isnan(row['sma_20']) else None,
                "sma_50": float(row['sma_50']) if not math.isnan(row['sma_50']) else None,
                "sma_200": float(row['sma_200']) if pd.notna(row['sma_200']) else None,
                "sma_200_usd": float(row['sma_200_usd']) if pd.notna(row['sma_200_usd']) else None,
                "rgold": float(row['rgold']) if pd.notna(row['rgold']) else None,
                "bb_upper": float(row['bb_bbh']) if not math.isnan(row['bb_bbh']) else None,
                "bb_lower": float(row['bb_bbl']) if not math.isnan(row['bb_bbl']) else None,
                "bb_pband": float(row['bb_pband']) if not math.isnan(row['bb_pband']) else None,
                "bb_usd_upper": float(row['bb_usd_hband']) if not math.isnan(row['bb_usd_hband']) else None,
                "bb_usd_middle": float(row['sma_20_usd']) if not math.isnan(row['sma_20_usd']) else None,
                "bb_usd_lower": float(row['bb_usd_lband']) if not math.isnan(row['bb_usd_lband']) else None,
                "signal": hist_signal
            })
            
        current_tb_buy = None
        current_tb_sell = None
        if not tb_df.empty:
            valid_tb = tb_df.dropna(subset=['buy_price', 'sell_price'])
            if not valid_tb.empty:
                last_tb = valid_tb.iloc[-1]
                current_tb_buy = float(last_tb['buy_price']) if pd.notna(last_tb['buy_price']) else None
                current_tb_sell = float(last_tb['sell_price']) if pd.notna(last_tb['sell_price']) else None
            
        current_dxf = None
        if 'dxf' in locals() and not dxf.empty:
            current_dxf = float(dxf['Close']['DX-Y.NYB'].dropna().iloc[-1])
            
        current_gold_high = None
        current_gold_low = None
        if global_gold is not None and not global_gold.empty:
            try:
                current_gold_high = float(global_gold['High'][gold_ticker].dropna().iloc[-1])
                current_gold_low = float(global_gold['Low'][gold_ticker].dropna().iloc[-1])
            except KeyError:
                current_gold_high = float(global_gold['High'].dropna().iloc[-1])
                current_gold_low = float(global_gold['Low'].dropna().iloc[-1])
            
        return {
            "status": "success",
            "current_buy_price": current_tb_buy,
            "current_sell_price": current_tb_sell,
            "current_global_price": float(latest['global_twd_price']),
            "current_global_price_usd": float(latest['global_price']),
            "current_volume": float(latest['volume']) if pd.notna(latest['volume']) else 0.0,
            "data_source": gold_ticker,
            "current_bb_usd_upper": float(latest['bb_usd_hband']),
            "current_bb_usd_middle": float(latest['sma_20_usd']),
            "current_bb_usd_lower": float(latest['bb_usd_lband']),
            "current_dxf": current_dxf,
            "current_gold_high": current_gold_high,
            "current_gold_low": current_gold_low,
            "current_sma_200": float(latest['sma_200']) if pd.notna(latest['sma_200']) else None,
            "current_sma_200_usd": float(latest['sma_200_usd']) if pd.notna(latest['sma_200_usd']) else None,
            "current_rgold": current_rgold,
            "signal": signal,
            "reasons": signal_reasons,
            "history": records
        }
    except Exception as e:
        logger.error(f"Error fetching data: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
