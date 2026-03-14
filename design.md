# Bubo Ecosystem Design Document

This document outlines the architecture and implementation of the Bubo project, specifically focusing on the `BuboDocMgr` and `BuboAIProxy` services.

## Overview

The Bubo ecosystem consists of specialized Node.js services designed for modularity, reliability, and modern web interaction.
- **BuboDocMgr**: Handles document lifecycle, metadata management, and backup.
- **BuboAIProxy**: Provides a reliable, queued interface for interacting with various AI LLM providers.

---

## 1. BuboDocMgr (Document Manager)

A service for managing documents with focus on PDF interaction and cloud backup.

### Feature Highlights
- **SQLite Metadata Storage**: Tracks document title, path, URI, type, and notes.
- **PDF.js Integration**: High-clarity PDF rendering with Retina display support.
- **Note-Taking**: Integrated sidepanel for writing and persisting reading notes.
- **Google Drive Backup**: Service account integration for backing up and restoring documents.

### API Specification
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/docs` | `GET` | List all document metadata |
| `/api/docs` | `POST` | Upload a new document |
| `/api/docs/:id` | `GET` | Get document metadata |
| `/api/docs/file/:name` | `GET` | Stream the actual file |
| `/api/docs/:id/notes` | `PUT` | Save document-specific notes |
| `/api/backup` | `POST` | Trigger GDrive backup |
| `/api/restore` | `POST` | Trigger GDrive restore |

### Database Schema (`documents`)
- `id`: Primary Key
- `title`, `file_path`, `file_type`, `size`
- `last_modified`: Timestamp
- `gdrive_id`: Reference for backups
- `notes`: Markdown-compatible text field

---

## 2. BuboAIProxy (AI Queue Proxy)

A reliable gateway for AI API calls designed to handle rate limits and ensure request persistence.

### Key Capabilities
- **Request Queueing**: Every request is assigned a UUID and persisted in SQLite.
- **Background Dispatcher**: Polling mechanism to process requests asynchronously.
- **Command Dictionary**: Decouples API calls from prompts via template mapping.
- **Multi-Model Support**: Ready for Gemini and DeepSeek.

### Flow Architecture
1. **Client** -> `POST /api/request` (Command + Params) -> **Proxy**
2. **Proxy** -> Generates UUID, stores in DB as `pending` -> Returns UUID to Client
3. **Dispatcher** -> Polls Pending -> Fetches Prompt Template -> Calls AI API
4. **Proxy** -> Updates DB with AI Result and marks as `completed`
5. **Client** -> `GET /api/status/:uuid` -> Polls until `completed` -> `GET /api/result/:uuid`

### Database Schema
- **`requests`**: `uuid`, `command`, `params`, `status`, `result`, `error`, `timestamps`.
- **`commands`**: `command`, `prompt_template`, `model`, `parameters`.

---

## 3. Global Configuration

Both services utilize `.env` files for configuration, aligning with the project's standard pattern:

- `PORT`: Port number for the service.
- `DB_FILE`: Path to the SQLite database file.
- `API_KEYS`: Provider-specific keys (e.g., `GEMINI_API_KEY`).
- `STORAGE_DIRS`: Paths for uploaded files or local resource caches.

---

## 5. BuboBots (Messaging Bot Service)

A multi-platform messaging bot service, starting with Google Chat support.

### Feature Highlights
- **Multi-Platform**: Support for Google Chat (Webhook) and Telegram (Long Polling).
- **Proactive Messaging**: Ability to send messages initiated by the server (not just replies).
- **Dynamic System Tasks**: The scheduler supports a plugin-style architecture. Place your JS tools in the `BuboBots/scheduleTool/` directory and export `getTaskFunction()` to make them available in the management console.
- **Persistence**: Schedules are stored in SQLite for reliability across restarts.
- **Management Console**: Web-based UI to manage bot settings and schedules.
- **Bot Token / SA Auth**: Secure authentication for each platform.

### Architecture
1. **Messaging Platform** -> Sends Event (JSON) -> **BuboBots Webhook**
2. **Bot Provider** -> Parses Event -> Calls **Command Handler**
3. **Command Handler** -> Executes Logic -> Returns Text Response
4. **BuboBots** -> Returns Response JSON to Messaging Platform

---

## 6. Global Configuration

Each service provides a `console.html` for administrative tasks:
- **DocMgr Console**: Uploads, deletes, and GDrive operations.
- **AIProxy Console**: Command dictionary editor and request queue monitor.

Additionally, `appBuboReader.html` serves as a user-facing specialized application for interactive PDF reading.
