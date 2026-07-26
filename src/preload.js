const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openAudienceView: () => ipcRenderer.send('open-audience-view'),
  openFullscreenPresentation: () => ipcRenderer.send('open-fullscreen-presentation'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  exportToPPTX: () => ipcRenderer.invoke('export-to-pptx'),
  onExportProgress: (callback) => ipcRenderer.on('export-progress', (_event, value) => callback(value))
});
