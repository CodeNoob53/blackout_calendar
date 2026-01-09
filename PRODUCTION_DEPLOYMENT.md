# Production Deployment Guide

## Issue: Zoe Connection Timeout (Geo-blocking)

### Problem
When deploying outside Ukraine (e.g., Render.com Frankfurt datacenter), the Zoe website (`zoe.com.ua`) blocks connections with timeout errors. This is due to geo-blocking that restricts access to Ukrainian IP addresses only.

**Error symptoms:**
- `ECONNABORTED` / `ETIMEDOUT` errors when fetching from zoe.com.ua
- All 3 retry attempts fail with 20-second timeouts
- Works locally (Kyiv IP) but fails in production (non-Ukrainian IP)

### Solution
The system now automatically falls back to **Telegram-only mode** when Zoe is unavailable:

1. **Automatic Fallback**: SyncEngine detects Zoe failures and continues with Telegram data only
2. **Faster Timeout**: Reduced timeout from 20s to 15s and retries from 3 to 2 (30s → 16s total)
3. **Better Logging**: Clear messages about geo-blocking and fallback behavior
4. **Configuration Option**: Can disable Zoe entirely via environment variable

### Configuration for Production

Add this to your production `.env` file:

```bash
# Disable Zoe scraper for non-Ukrainian deployments
ENABLE_ZOE_SCRAPER=false
```

This will:
- Skip Zoe scraping entirely (saves ~16 seconds per update cycle)
- Use only Telegram as data source
- Prevent timeout errors in logs

### Alternative: Keep Auto-Fallback

If you want to **keep trying Zoe** (in case geo-blocking is lifted):

```bash
# Keep Zoe enabled with automatic fallback
ENABLE_ZOE_SCRAPER=true
```

The system will:
- Try to connect to Zoe (takes ~16 seconds on failure)
- Automatically fall back to Telegram if Zoe times out
- Log warnings about geo-blocking

## Issue: Time Format Problems

### Problem 1: Telegram 24:00 Format
Recent Telegram messages use `24:00` time format (e.g., "22:30 – 24:00"), which is technically invalid. Should be `00:00` of the next day.

**Example from message 2723:**
```
2.1: 13:30 – 18:30, 22:30 – 24:00
4.2: 13:30 – 18:30, 22:30 – 24:00
6.1: 05:30 – 09:30, 13:30 – 18:30, 22:30 – 24:00
```

### Problem 2: Zoe Dash/Hyphen Format
Zoe website changed time format from `16:00` (colon) to `16-00` (dash/hyphen).

**Examples:**
```
Old format: 1.1: 00:00 – 05:30, 09:00 – 16:00
New format: 1.1: 00-00 – 05-30, 09-00 – 16-00
```

This is worse than Telegram because Zoe format changes unpredictably.

### Solution
Parser now handles **ALL** time format variations automatically:

#### 24:00 Normalization
```json
Before: {"start": "22:30", "end": "24:00"}
After:  {"start": "22:30", "end": "00:00"}
```

#### Multiple Time Formats
Parser supports all these formats simultaneously:
- ✓ `16:00` - Standard format with colon
- ✓ `16-00` - Dash format (hyphen-minus U+002D)
- ✓ `16‐00` - Hyphen format (U+2010)
- ✓ `16−00` - Minus sign format (U+2212)
- ✓ Mixed formats in same text (e.g., "09:00 – 14-00")

This ensures:
- ✓ Works regardless of which format Zoe uses
- ✓ Works when Zoe changes format
- ✓ Works with Telegram format variations
- ✓ Valid time format for database storage
- ✓ Compatible with time validation logic
- ✓ No parsing errors

## Deployment Steps

1. **Update environment variables** in Render.com dashboard:
   ```bash
   ENABLE_ZOE_SCRAPER=false
   ```

2. **Redeploy** or restart the service

3. **Verify** in logs:
   - Should see: `Zoe scraper is disabled (ENABLE_ZOE_SCRAPER=false), skipping`
   - Should NOT see: timeout errors or `ECONNABORTED`

## Testing

To test locally with the fixes:

```bash
# Test parser with 24:00 format
node test_parser.js

# Test Zoe connection (will timeout outside Ukraine)
node test_zoe_connection.js
```

Expected output:
- Parser: All `24:00` times converted to `00:00`
- Zoe: Timeout with geo-blocking warning, fallback to Telegram

## Summary

✅ **24:00 time format** - Fixed, automatically normalized to 00:00
✅ **Zoe dash format (16-00)** - Fixed, supports both colon and dash formats
✅ **Zoe geo-blocking** - Solved with automatic Telegram fallback
✅ **Format flexibility** - Works with any time format Zoe or Telegram uses
✅ **Production-ready** - Set `ENABLE_ZOE_SCRAPER=false` for deployments outside Ukraine
