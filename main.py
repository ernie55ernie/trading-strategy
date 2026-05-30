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
from datetime import timedelta

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
        url = 'https://rate.bot.com.tw/gold/chart/year/TWD'
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        res = requests.get(url, headers=headers)
        
        dfs = pd.read_html(res.text)
        if not dfs:
            return {"error": "No tables found on Taiwan Bank website."}
            
        tb_df = dfs[0]
        tb_df.columns = ['date', 'currency', 'weight', 'buy_price', 'sell_price']
        tb_df['date'] = pd.to_datetime(tb_df['date']).dt.tz_localize(None)
        tb_df = tb_df.sort_values(by='date').reset_index(drop=True)
        tb_df = tb_df[['date', 'buy_price', 'sell_price']]
        
        years_map = {"1y": 1, "3y": 3, "5y": 5, "10y": 10}
        target_years = years_map.get(period, 1)
        
        end_date = tb_df['date'].max() + timedelta(days=1)
        start_date = end_date - timedelta(days=365 * target_years)
        
        # PAXG-USD: Paxos Gold token - 1 PAXG = 1 troy oz of LBMA-certified gold in London Brink's vaults
        # Tracks London Bullion Market (LBMA) spot price accurately; 365-day coverage
        paxg = yf.download('PAXG-USD', start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'), progress=False)
        twd = yf.download('TWD=X', start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'), progress=False)
        
        if paxg.empty or twd.empty:
            return {"error": "Failed to fetch global market data."}
            
        df = pd.DataFrame({
            'global_price': paxg['Close']['PAXG-USD'],
            'usd_twd': twd['Close']['TWD=X']
        }).dropna()
        
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
        
        indicator_bb = ta.volatility.BollingerBands(close=df['close'], window=20, window_dev=2)
        df['bb_bbh'] = indicator_bb.bollinger_hband()
        df['bb_bbl'] = indicator_bb.bollinger_lband()
        df['bb_pband'] = indicator_bb.bollinger_pband()
        
        indicator_bb_usd = ta.volatility.BollingerBands(close=df['global_price'], window=20, window_dev=2)
        df['bb_usd_hband'] = indicator_bb_usd.bollinger_hband()
        df['bb_usd_lband'] = indicator_bb_usd.bollinger_lband()
        df['sma_20_usd'] = ta.trend.SMAIndicator(close=df['global_price'], window=20).sma_indicator()
        
        df.dropna(subset=['sma_50', 'bb_bbh'], inplace=True)
        df = df.reset_index(drop=True)
        
        if df.empty:
             return {"error": "Not enough data points after indicator calculation."}
             
        latest = df.iloc[-1]
        signal = "HOLD"
        signal_reasons = []
        
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
             
        bullish_points = sum([1 for r in signal_reasons if "超賣" in r or "黃金" in r or "進場" in r])
        bearish_points = sum([1 for r in signal_reasons if "超買" in r or "死亡" in r or "出場" in r])
        
        if bullish_points > bearish_points:
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
                
            if bullish > bearish: hist_signal = "BUY"
            elif bearish > bullish: hist_signal = "SELL"

            records.append({
                "time": row['date'].strftime('%Y-%m-%d'),
                "global_price": float(row['global_twd_price']),
                "buy_price": float(row['buy_price']) if pd.notna(row['buy_price']) else None,
                "sell_price": float(row['sell_price']) if pd.notna(row['sell_price']) else None,
                "value": float(row['global_twd_price']), # for primary global series mapping
                "rsi": float(row['rsi']) if not math.isnan(row['rsi']) else None,
                "macd": float(row['macd']) if not math.isnan(row['macd']) else None,
                "macd_signal": float(row['macd_signal']) if not math.isnan(row['macd_signal']) else None,
                "macd_hist": float(row['macd_diff']) if not math.isnan(row['macd_diff']) else None,
                "sma_20": float(row['sma_20']) if not math.isnan(row['sma_20']) else None,
                "sma_50": float(row['sma_50']) if not math.isnan(row['sma_50']) else None,
                "bb_upper": float(row['bb_bbh']) if not math.isnan(row['bb_bbh']) else None,
                "bb_lower": float(row['bb_bbl']) if not math.isnan(row['bb_bbl']) else None,
                "bb_pband": float(row['bb_pband']) if not math.isnan(row['bb_pband']) else None,
                "bb_usd_upper": float(row['bb_usd_hband']) if not math.isnan(row['bb_usd_hband']) else None,
                "bb_usd_middle": float(row['sma_20_usd']) if not math.isnan(row['sma_20_usd']) else None,
                "bb_usd_lower": float(row['bb_usd_lband']) if not math.isnan(row['bb_usd_lband']) else None,
                "signal": hist_signal
            })
            
        latest_tb = tb_df.dropna().iloc[-1] if not tb_df.dropna().empty else {"buy_price": 0, "sell_price": 0}
            
        return {
            "status": "success",
            "current_buy_price": float(latest_tb['buy_price']),
            "current_sell_price": float(latest_tb['sell_price']),
            "current_global_price": float(latest['global_twd_price']),
            "current_global_price_usd": float(latest['global_price']),
            "current_bb_usd_upper": float(latest['bb_usd_hband']),
            "current_bb_usd_middle": float(latest['sma_20_usd']),
            "current_bb_usd_lower": float(latest['bb_usd_lband']),
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
