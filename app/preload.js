const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('asHub', {
  getData: () => ipcRenderer.invoke('get-data'),
  scanGames: () => ipcRenderer.invoke('scan-games'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  launchGame: (game) => ipcRenderer.invoke('launch-game', game),
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  getCaptureFolder: () => ipcRenderer.invoke('get-capture-folder'),
  pickGame: () => ipcRenderer.invoke('pick-game')
});
