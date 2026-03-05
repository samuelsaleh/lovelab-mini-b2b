#!/usr/bin/env node
/**
 * One-time script to get a Google Drive OAuth2 refresh token.
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com/apis/credentials
 *   2. Create an OAuth 2.0 Client ID (type: "Web application")
 *   3. Add http://localhost:3333 as an Authorized redirect URI
 *   4. Copy the Client ID and Client Secret
 *
 * Usage:
 *   node scripts/get-drive-token.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * This will open a browser, ask you to sign in, and print the refresh token.
 */

import http from 'http';
import { execSync } from 'child_process';

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];
const REDIRECT_URI = 'http://localhost:3333';
const SCOPES = 'https://www.googleapis.com/auth/drive';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Usage: node scripts/get-drive-token.mjs <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n1. Opening browser for Google sign-in...\n');
console.log(`   If it doesn't open, go to:\n   ${authUrl}\n`);

try {
  execSync(`open "${authUrl}"`);
} catch {
  // non-macOS or open failed
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:3333`);
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h2>Error: no code received</h2>');
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const data = await tokenRes.json();

    if (data.refresh_token) {
      console.log('\n=== SUCCESS ===\n');
      console.log('Add these to your .env and Vercel:\n');
      console.log(`GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}`);
      console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
      console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${data.refresh_token}`);
      console.log('\n===============\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Done! You can close this tab. Check the terminal for your refresh token.</h2>');
    } else {
      console.error('\nError: No refresh_token in response:', data);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h2>Error</h2><pre>${JSON.stringify(data, null, 2)}</pre>`);
    }
  } catch (err) {
    console.error('Token exchange error:', err);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h2>Error</h2><pre>${err.message}</pre>`);
  }

  setTimeout(() => process.exit(0), 1000);
});

server.listen(3333, () => {
  console.log('2. Waiting for Google callback on http://localhost:3333 ...\n');
});
