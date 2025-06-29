// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('fs')



function createWindow () {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    fullscreen: true,
      fullscreenable: true, // Ensure the window can be fullscreened
    kiosk: true, // Enable kiosk mode for a more immersive fullscreen experience
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })
 mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') {
      app.quit(); // Exit the application when Escape is pressed
    }
  });
  mainWindow.maximize();
  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.


const logFilePath = path.join(__dirname, 'renderer.log');

ipcMain.handle('log-to-file', async (event, message, args) => {
  console.log(message, args);
  let json = JSON.stringify(args);
  const logEntry = `[${new Date().toISOString()}]  ${message} => ${json}\n`;
  await fs.promises.appendFile(logFilePath, logEntry).catch(err => {
    if (err) console.error('Failed to write log:', err);
  });
});


// IPC handler to download an image
ipcMain.handle('download-image-from-base64', async (event, base64Data, filename) => {
  // Remove data URL header if present
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  let buffer;
  if (matches && matches.length === 3) {
    buffer = Buffer.from(matches[2], 'base64');
  } else {
    buffer = Buffer.from(base64Data, 'base64');
  }
  
  // Define the file path (e.g., saving in the Pictures folder)
  const filePath = path.join(app.getPath('pictures'), filename);
  
  console.log(`Saving image to: ${filePath}`); // Log the file path for debugging
  // Write the buffer to file
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
});


