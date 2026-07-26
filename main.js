const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { startServer } = require('./src/server');
const { startSocketServer } = require('./src/socket');
const fs = require('fs');

const PptxGenJS = require('pptxgenjs');

let mainWindow;
let currentHtmlFile = null;
let expressApp, server, io;

function createWindow() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  
  if (app.dock) {
    app.dock.setIcon(iconPath);
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'PrezenHTML',
    frame: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // allow loading local iframes with file:// if needed, but we'll use http://localhost
    }
  });

  // Window control IPC handlers
  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });
  
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  
  ipcMain.on('window-close', () => {
    mainWindow.close();
  });

  // Load the Vite dev server in development, or the built file in production
  if (!app.isPackaged && process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  // Initialize the local server for serving the slides
  const port = 4567; // default port
  const { app: expApp, server: httpServer } = startServer(port);
  expressApp = expApp;
  server = httpServer;
  io = startSocketServer(server);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handler for opening a file dialog
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'HTML Files', extensions: ['html', 'htm'] }
    ]
  });

  if (result.canceled) {
    return null;
  } else {
    currentHtmlFile = result.filePaths[0];
    
    // Notify the express server about the new file to serve
    expressApp.set('slideFile', currentHtmlFile);

    return currentHtmlFile;
  }
});

// IPC handler for opening the audience view in the default browser
ipcMain.on('open-audience-view', () => {
  shell.openExternal('http://localhost:4567/audience');
});

// IPC handler for opening the presentation fullscreen in the app
let fullscreenWindow = null;
ipcMain.on('open-fullscreen-presentation', () => {
  if (fullscreenWindow) {
    fullscreenWindow.focus();
    return;
  }
  fullscreenWindow = new BrowserWindow({
    title: 'PrezenHTML - Fullscreen',
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  fullscreenWindow.loadURL('http://localhost:4567/audience');
  
  // Close fullscreen when Escape is pressed
  fullscreenWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') {
      fullscreenWindow.close();
    }
  });

  fullscreenWindow.on('closed', () => {
    fullscreenWindow = null;
  });
});

// IPC handler for exporting to PPTX
ipcMain.handle('export-to-pptx', async () => {
  if (!currentHtmlFile || !fs.existsSync(currentHtmlFile)) {
    throw new Error('No valid HTML file loaded');
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export to PPTX',
    defaultPath: 'presentation.pptx',
    filters: [
      { name: 'PowerPoint Presentation', extensions: ['pptx'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return false;
  }

  const savePath = result.filePath;
  
  return new Promise((resolve, reject) => {
    let extractWindow = new BrowserWindow({
      width: 1920,
      height: 1080,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    extractWindow.loadFile(currentHtmlFile);

    extractWindow.webContents.on('did-finish-load', async () => {
      try {
        const numSlides = await extractWindow.webContents.executeJavaScript(`document.querySelectorAll('.slide').length`);
        const layoutData = [];

        mainWindow.webContents.send('export-progress', { stage: 'extracting', current: 0, total: numSlides });

        // Inject CSS to disable all transitions/animations so slides render instantly
        await extractWindow.webContents.executeJavaScript(`
          const style = document.createElement('style');
          style.innerHTML = '* { transition: none !important; animation: none !important; transition-delay: 0s !important; }';
          document.head.appendChild(style);
        `);

        for (let i = 0; i < numSlides; i++) {
          const slideData = await extractWindow.webContents.executeJavaScript(`
            (async () => {
              const slides = document.querySelectorAll('.slide');
              const slide = slides[${i}];
              
              slides.forEach(s => {
                s.classList.remove('active', 'visible');
                s.style.display = 'none';
              });
              
              slide.classList.add('active', 'visible');
              slide.style.display = '';
              
              // Wait a tiny bit for the browser to paint
              await new Promise(r => setTimeout(r, 100));
              
              const notesEl = slide.querySelector('.speaker-notes');
              return {
                notes: notesEl ? notesEl.innerText : ''
              };
            })();
          `);
          
          // Capture the screenshot of the slide
          const image = await extractWindow.webContents.capturePage();
          slideData.image = image.toDataURL(); // Data URL (e.g. data:image/png;base64,...)
          
          layoutData.push(slideData);
          mainWindow.webContents.send('export-progress', { stage: 'extracting', current: i + 1, total: numSlides });
        }

        extractWindow.close();
        mainWindow.webContents.send('export-progress', { stage: 'generating' });

        let pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_16x9';

        for (const slideData of layoutData) {
          let slide = pptx.addSlide();
          
          // Add the full-screen screenshot to the slide
          slide.addImage({ data: slideData.image, x: 0, y: 0, w: '100%', h: '100%' });
          
          if (slideData.notes) {
            slide.addNotes(slideData.notes);
          }
        }

        await pptx.writeFile({ fileName: savePath });
        resolve(true);
      } catch (err) {
        console.error('PPTX extraction error:', err);
        if (!extractWindow.isDestroyed()) extractWindow.close();
        reject(err);
      }
    });
  });
});
