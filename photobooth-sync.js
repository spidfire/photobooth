// photobooth-sync.js
// Logic to check online status, fetch last uploaded file, and upload newer files from local directory
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Helper: generate filename from Date (copied from renderer.js)
function fileNameGeneratorFromDate(date) {
  function pad2(n) { return n < 10 ? '0' + n : n }
  return (
    date.getFullYear().toString() +
    pad2(date.getMonth() + 1) +
    pad2(date.getDate()) +
    pad2(date.getHours()) +
    pad2(date.getMinutes()) +
    pad2(date.getSeconds())
  );
}

function extractDateFromFilename(filename) {
  // Assumes filename starts with 2025-06-29175157_3_screenshot.jpg
  const match = filename.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_(\d+)_screenshot\.jpg/);
  if (!match) return null;
  const year = parseInt(match[1].substring(0, 4), 10);
  const month = parseInt(match[1].substring(5, 7), 10) - 1; // JS months are 0-indexed
  const day = parseInt(match[1].substring(8, 10), 10);
  const hour = parseInt(match[2], 10);
  const minute = parseInt(match[3], 10);
  const second = parseInt(match[4], 10);
  return [new Date(year, month, day, hour, minute, second), match[5]];
}

function isOnline() {
  return new Promise((resolve) => {
    https.get('https://dansschoolpendulum.nl/photobooth/last', (res) => {
      resolve(res.statusCode === 200);
    }).on('error', (e) => {console.log(e); resolve(false)});
  });
}

function getLastUploadedFilename() {
  return new Promise((resolve, reject) => {
    let data = '';
    https.get('https://dansschoolpendulum.nl/photobooth/last', (res) => {
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    }).on('error', reject);
  });
}

function getLocalImageFiles(dir) {
  // Only look for files matching the photobooth filename pattern
  return fs.readdirSync(dir).filter(f => f.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_(\d+)_screenshot\.jpg/)).sort((a, b) => {
    return a - b;
  });
}

function uploadFile(filePath, filename) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    const req = https.request({
      hostname: 'dansschoolpendulum.nl',
      path: '/photobooth/upload?filename=' + encodeURIComponent(filename),
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': filename
      }
    }, (res) => {
      res.on('data', (chunk) => {
        console.log('chunk', chunk.toString());
      });
      res.on('end', () => {
        
        console.log('Upload response:', res.statusCode);
        resolve(res.statusCode === 200)
    });
    });
    req.on('error', reject);
    fileStream.pipe(req);
  });
}

let locked = false;

async function syncNewerFiles(localDir) {
  if (locked) {
    console.log('Sync already in progress, skipping.');
    return;
  }
  locked = true;
  if (!await isOnline()) {
    console.log('Offline, skipping sync.');
    return;
  }
  let lastRemote;
  try {
    lastRemote = await getLastUploadedFilename();
  } catch (e) {
    console.log('Could not fetch last remote file:', e);
    return;
  }
  const [lastRemoteDate, lastRemoteId] = extractDateFromFilename(lastRemote);
  if (!lastRemoteDate) {
    console.log('Could not parse remote last file date.');
    return;
  }
  const files = getLocalImageFiles(localDir);
  for (const file of files) {
    const [localDate, id] = extractDateFromFilename(file);
   console.log('Checking file:', file, 'Local date:', localDate, 'Remote date:', lastRemoteDate, 'Remote ID:', lastRemoteId, 'Local ID:', id);
    if (localDate && localDate >= lastRemoteDate && lastRemoteId < id) {
      const filePath = path.join(localDir, file);
       
      try {
        const success = await uploadFile(filePath, file);
        if (success) {
          console.log('Uploaded newer file:', file);
        } else {
          console.log('Failed to upload file:', file, success);
          break; // Stop on first failure
        }
      } catch (e) {
        console.log('Error uploading file:', file, e);
      }
    }
  }
  locked = false;
}

module.exports = { syncNewerFiles };
