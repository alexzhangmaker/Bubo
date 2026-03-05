# BuboCloudCache

A Node.js service that caches Google Drive folder contents locally.

## Features
1. **Metadata Sync**: Fetches file metadata (name, UUID, URL, update time) from a specified Google Drive folder and stores it in SQLite.
2. **Local Caching**: On-demand downloading and caching of files to a local directory.
3. **API Access**: 
    - `GET /api/metadata`: List all cached metadata.
    - `GET /api/file/:uuid`: Get metadata for a specific file.
    - `GET /api/file/:uuid/content`: Fetch file content (downloads from Drive if not already cached).
4. **Scheduled Sync**: Automatically syncs metadata every hour.

## Setup
1. **Environment Variables**: Use `.env` (see `.env.example`).
    - `FIREBASE_CLIENT_EMAIL`: Google Service Account email.
    - `FIREBASE_PRIVATE_KEY`: Google Service Account private key.
    - `GOOGLE_DRIVE_FOLDER_ID`: The ID of the folder to cache.
2. **Install Dependencies**: `npm install`.
3. **Run**: `node index.js`.

## API Documentation

### Get All Metadata
`GET http://localhost:3001/api/metadata`

### Get File Content
`GET http://localhost:3001/api/file/<uuid>/content`
- Returns the file content.
- If not cached, it will be downloaded from Google Drive first.

### Manual Sync
`POST http://localhost:3001/api/sync`
- Triggers a manual sync of metadata from Google Drive.
