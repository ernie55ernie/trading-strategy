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
        
        # Scrape data from Taiwan Bank using a User-Agent
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        res = requests.get(url, headers=headers)
        
        # Use pandas to read the HTML table
        dfs = pd.read_html(res.text)
        if not dfs:
            return {"error": "No tables found on Taiwan Bank website."}
            
        df = dfs[0]
        
        # Rename columns to standard English names
        # Original: Index(['日期', '牌價幣別', '商品重量', '本行買入價格', '本行賣出價格'], dtype='object')
        df.columns = ['date', 'currency', 'weight', 'buy_price', 'sell_price']
        
        # Convert date to datetime and sort ascending (oldest to newest for technical indicators)
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values(by='date').reset_index(drop=True)
        
        # --- NEW: yfinance backfill logic ---
        years_map = {"1y": 1, "3y": 3, "5y": 5, "10y": 10}
        target_years = years_map.get(period, 1)
        
        if target_years > 1:
            try:
                earliest_tb_date = df['date'].min()
                start_date = earliest_tb_date - timedelta(days=365 * target_years)
                end_date = earliest_tb_date
                
                gc = yf.download('GC=F', start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'), progress=False)
                twd = yf.download('TWD=X', start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'), progress=False)
                
                if not gc.empty and not twd.empty:
                    yf_df = pd.DataFrame({
                        'gold': gc['Close']['GC=F'],
                        'usd_twd': twd['Close']['TWD=X']
                    }).dropna()
                    
                    if not yf_df.empty:
                        yf_df['proxy_twd_gram'] = (yf_df['gold'] / 31.1034768) * yf_df['usd_twd']
                        yf_df['sell_price'] = (yf_df['proxy_twd_gram'] * 1.006).round(0)
                        yf_df['buy_price'] = (yf_df['proxy_twd_gram'] * 0.994).round(0)
                        
                        yf_df = yf_df.reset_index()
                        yf_df.rename(columns={'Date': 'date'}, inplace=True)
                        
                        yf_df['currency'] = 'TWD'
                        yf_df['weight'] = '1公克'
                        yf_df = yf_df[['date', 'currency', 'weight', 'buy_price', 'sell_price']]
                        
                        yf_df['date'] = pd.to_datetime(yf_df['date']).dt.tz_localize(None)
                        df['date'] = pd.to_datetime(df['date']).dt.tz_localize(None)
                        
                        df = pd.concat([yf_df, df], ignore_index=True)
                        df = df.sort_values(by='date').reset_index(drop=True)
            except Exception as ex:
                logger.warning(f"Failed to fetch yfinance backfill data: {ex}")
        # --- END NEW ---
        
        # Use 'sell_price' (本行賣出價格) as the 'close' price for analysis
        df['close'] = df['sell_price']
        
        # Calculate Indicators using the 'ta' library
        # RSI
        df['rsi'] = ta.momentum.RSIIndicator(close=df['close'], window=14).rsi()
        
        # MACD
        macd = ta.trend.MACD(close=df['close'])
        df['macd'] = macd.macd()
        df['macd_signal'] = macd.macd_signal()
        df['macd_diff'] = macd.macd_diff()
        
        # SMA
        df['sma_20'] = ta.trend.SMAIndicator(close=df['close'], window=20).sma_indicator()
        df['sma_50'] = ta.trend.SMAIndicator(close=df['close'], window=50).sma_indicator()
        
        # Bollinger Bands
        indicator_bb = ta.volatility.BollingerBands(close=df['close'], window=20, window_dev=2)
        df['bb_bbh'] = indicator_bb.bollinger_hband()
        df['bb_bbl'] = indicator_bb.bollinger_lband()
        df['bb_pband'] = indicator_bb.bollinger_pband()
        
        # Drop NaN generated by indicators (first few rows)
        df.dropna(inplace=True)
        
        # Generate Trading Signal (Current Day)
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
             
        # Basic logic for signal
        bullish_points = sum([1 for r in signal_reasons if "超賣" in r or "黃金" in r or "進場" in r])
        bearish_points = sum([1 for r in signal_reasons if "超買" in r or "死亡" in r or "出場" in r])
        
        if bullish_points > bearish_points:
            signal = "BUY"
        elif bearish_points > bullish_points:
            signal = "SELL"
            
        if not signal_reasons:
            signal_reasons.append("目前無強烈技術指標訊號。")

        # Prepare JSON response
        records = []
        for i in range(len(df)):
            row = df.iloc[i]
            
            # Calculate historical signal for markers
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
                "buy_price": float(row['buy_price']),
                "sell_price": float(row['sell_price']),
                "value": float(row['sell_price']), # for Area/Line series
                "rsi": float(row['rsi']) if not math.isnan(row['rsi']) else None,
                "macd": float(row['macd']) if not math.isnan(row['macd']) else None,
                "macd_signal": float(row['macd_signal']) if not math.isnan(row['macd_signal']) else None,
                "macd_hist": float(row['macd_diff']) if not math.isnan(row['macd_diff']) else None,
                "sma_20": float(row['sma_20']) if not math.isnan(row['sma_20']) else None,
                "sma_50": float(row['sma_50']) if not math.isnan(row['sma_50']) else None,
                "bb_upper": float(row['bb_bbh']) if not math.isnan(row['bb_bbh']) else None,
                "bb_lower": float(row['bb_bbl']) if not math.isnan(row['bb_bbl']) else None,
                "bb_pband": float(row['bb_pband']) if not math.isnan(row['bb_pband']) else None,
                "signal": hist_signal
            })
            
        return {
            "status": "success",
            "current_buy_price": float(latest['buy_price']),
            "current_sell_price": float(latest['sell_price']),
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
