# BuboBots API Documentation

BuboBots exposes RESTful API endpoints for managing schedules, system tasks, and financial tickers, as well as several chat commands for interacting directly with the bots on Google Chat and Telegram.

---

## 🏗️ Base URL
The service typically runs locally on port `3305`.
\`\`\`
http://localhost:3305
\`\`\`

---

## 🗓️ Schedules API

### 1. Retrieve all schedules
**Endpoint:** \`GET /api/schedules\`
Returns a list of all active schedules configured in the system.

**Response (JSON Array):**
\`\`\`json
[
  {
    "id": 1,
    "provider": "telegram",
    "target_id": "123456789",
    "message": "Static text message here",
    "cron_expression": "0 9 * * *",
    "is_function": 0,
    "fn_module": null,
    "fn_name": null,
    "fn_args": null,
    "active": 1,
    "created_at": "2023-11-20 09:00:00"
  }
]
\`\`\`

### 2. Add a new schedule
**Endpoint:** \`POST /api/schedules\`
Creates a new schedule for proactive messages or dynamic task execution.

**Request Body (JSON):**
| Field | Type | Description |
|---|---|---|
| \`provider\` | String | Messaging provider (e.g., \`"google-chat"\`, \`"telegram"\`) |
| \`target_id\` | String | Recipient ID (\`spaces/...\` for Google, chat ID for Telegram) |
| \`cron_expression\` | String | Schedule in valid cron format (e.g., \`"0 17 * * *"\`) |
| \`is_function\` | Integer | \`1\` for dynamic tasks, \`0\` for static text |
| \`message\` | String/Null | Static message text (required if \`is_function\` is \`0\`) |
| \`fn_module\` | String/Null | Filename of the module (e.g., \`"yFinanceTask.js"\`) |
| \`fn_name\` | String/Null | Exported function name (e.g., \`"getTaskFunction"\`) |
| \`fn_args\` | String/Null | Function arguments encoded as JSON Array (e.g., \`"[]"\`) |

**Response:**
\`\`\`json
{ "id": 2 }
\`\`\`

### 3. Delete a schedule
**Endpoint:** \`DELETE /api/schedules/:id\`
Removes an existing schedule by its database \`id\`.

**Response:**
\`\`\`json
{ "success": true }
\`\`\`

---

## ⚙️ System Tasks API

### 1. List available dynamic tasks
**Endpoint:** \`GET /api/system-tasks\`
Scans the \`scheduleTool/\` directory and returns a list of scripts that export an executable function for bot tasks.

**Response (JSON Array):**
\`\`\`json
[
  {
    "module": "yFinanceTask.js",
    "name": "getTaskFunction"
  }
]
\`\`\`

---

## 📈 Ticker Tracking API

### 1. Get all tracked tickers
**Endpoint:** \`GET /api/tickers\`
Returns all financial tickers being tracked for price threshold alerts.

**Response (JSON Array):**
\`\`\`json
[
  {
    "id": 1,
    "ticker": "AAPL",
    "quoteMax": 260.50,
    "quoteMin": 250.00
  }
]
\`\`\`

### 2. Add or Update a tracked ticker
**Endpoint:** \`POST /api/tickers\`
Records a stock ticker and its alert thresholds. Uses UPSERT behind the scenes (overwrites if ticker already exists).

**Request Body (JSON):**
| Field | Type | Description |
|---|---|---|
| \`ticker\` | String | The stock symbol (e.g., \`"AAPL"\`) |
| \`quoteMax\` | Float/Null | Upper bound price (Sell alert threshold) |
| \`quoteMin\` | Float/Null | Lower bound price (Buy alert threshold) |

**Response:**
\`\`\`json
{ "id": 1 }
\`\`\`

### 3. Delete a tracked ticker
**Endpoint:** \`DELETE /api/tickers/:id\`
Removes a ticker from the tracking database.

**Response:**
\`\`\`json
{ "success": true }
\`\`\`

---

## 🚀 Immediate Message API

### 1. Send an instant message
**Endpoint:** \`POST /api/sendMessage\`
Instantly sends a message to a specific target via the configured channel (Telegram or Google Chat).

**Request Body (JSON):**
| Field | Type | Description |
|---|---|---|
| \`targetID\` | String | The recipient ID (\`spaces/...\` for Google, chat ID for Telegram) |
| \`message\` | String | The text content to send |
| \`channel\` | String | The platform: \`"telegram"\` or \`"googleChat"\` (\`"google-chat"\` also accepted) |

**Response:**
\`\`\`json
{ "success": true }
\`\`\`

---

## 💊 Health Check

### 1. Service Health
**Endpoint:** \`GET /health\`
Returns status of BuboBots service.

**Response:**
\`\`\`json
{ "status": "ok", "service": "BuboBots" }
\`\`\`

---

## 💬 Bot Chat Commands

These commands can be typed directly into the respective chat interfaces (Google Chat, Telegram).

| Command | Description | Example Usage |
|---|---|---|
| \`/echo [message]\` | Simple ping test to verify the bot is responding | \`/echo Hello world\` |
| \`/alert <ticker> <quote1> <quote2>\` | Starts tracking a ticker and sets Min/Max threshold alerts. Supports absolute values & relative percentages. | **Absolute**: \`/alert AAPL 250 260\`<br>**Relative**: \`/alert BN -10% +5%\` |
| \`/alerts\` | Displays a list of all currently tracked tickers and their thresholds. | \`/alerts\` |
| \`/help\` | Prints a list of system capabilities and available commands. | \`/help\` |
