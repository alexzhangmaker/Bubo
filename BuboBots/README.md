# BuboBots Configuration & Setup Guide

BuboBots is a messaging bot service. This guide covers how to set up the Google Chat integration.

## 1. Google Cloud Console Setup

1. **Create a Project**: Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. **Enable Google Chat API**: Search for "Google Chat API" and enable it.
3. **Configure the SDK**: In the "Configuration" tab of the Google Chat API:
   - **App name**: BuboBot
   - **Avatar URL**: (Optional)
   - **Description**: Bubo Messaging Bot
   - **Interactive features**: Enable this.
   - **Functionality**: Tick "Receive direct messages" and "Join spaces".
   - **Connection settings**: Select "HTTP endpoint URL" and enter your webhook URL (e.g., `https://your-tunnel.com/webhooks/google-chat`).
4. **Service Account**:
   - Go to **IAM & Admin > Service Accounts**.
   - Create a service account (e.g., `bubo-bot-sa`).
   - Create a JSON key for this account and download it.

## 2. Local Configuration

1. **Service Account Key**:
   - Place your downloaded JSON key at `BuboBots/config/service-account.json`.
2. **Environment Variables**:
   - Ensure `BuboBots/.env` contains the correct port and path:
     ```env
     PORT=3304
     GOOGLE_CHAT_KEY_FILE=./config/service-account.json
     ```

## 3. Exposing the Webhook

Google Chat requires a publicly accessible HTTPS URL. Use a tool like **ngrok** for local development:
```bash
ngrok http 3304
```
Copy the Forwarding URL (e.g., `https://xyz.ngrok.io`) and update the "HTTP endpoint URL" in the Google Chat API configuration to `https://xyz.ngrok.io/webhooks/google-chat`.

## 4. Running the Service

```bash
cd BuboBots
npm start
```

## 5. Testing the Bot

1. Open Google Chat.
2. Search for your bot (use the App Name configured in step 1.3).
3. Add it to a space or DM.
4. Type `/echo Hello Bubo!` and the bot should respond.
