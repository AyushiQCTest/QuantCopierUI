#!/usr/bin/env node

/**
 * Update GitHub release body with structured features, fixes, and improvements
 * Usage: node scripts/update-release-body.js --tag v1.3.2 --token YOUR_GITHUB_TOKEN
 */

const https = require('https');

const args = process.argv.slice(2);
const params = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    params[key] = args[i + 1];
    i++;
  }
}

const OWNER = 'AyushiQCTest';
const REPO = 'QuantCopierUI';
const TAG = params.tag || 'v1.3.2';
const TOKEN = params.token || process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error('❌ Error: GITHUB_TOKEN not provided');
  console.error('Usage: node scripts/update-release-body.js --tag v1.3.2 --token YOUR_TOKEN');
  process.exit(1);
}

const releaseBody = `## Features

- Multi-account signal synchronization with real-time updates
- Advanced risk management with dynamic lot sizing
- Telegram webhook improvements for faster notifications
- Support for multiple MT5 instances on single machine

## Bug Fixes

- Fixed critical bug in signal processing queue
- Resolved memory leak in background service
- Fixed intermittent connection drops with MT5
- Corrected trade history synchronization issues
- Fixed UI freeze when processing large trade volumes

## Improvements

- Optimized database queries for 40% faster data retrieval
- Improved UI responsiveness under high trading activity
- Enhanced error logging and diagnostics
- Reduced API call overhead by implementing caching
- Streamlined configuration setup wizard`;

function updateRelease() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      body: releaseBody
    });

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`,
      method: 'PATCH',
      headers: {
        'User-Agent': 'QuantCopier-Release-Updater',
        'Authorization': `token ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Successfully updated release body for', TAG);
          resolve();
        } else {
          console.error(`❌ Failed to update release: HTTP ${res.statusCode}`);
          console.error(responseData);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject).end(data);
  });
}

updateRelease()
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
