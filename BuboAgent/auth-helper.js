import { google } from 'googleapis';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/spreadsheets'
];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // 强制获取 refresh token
});

console.log('1. Open this URL in your browser:\n', authUrl);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('\n2. Paste the "code" parameter from the redirect URL here: ', async (code) => {
    try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('\n3. Your GOOGLE_REFRESH_TOKEN is:\n', tokens.refresh_token);
        console.log('\nCopy this into your .env file.');
    } catch (e) {
        console.error('Error retrieving access token', e);
    }
    rl.close();
});
