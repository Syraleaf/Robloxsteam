const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getLibrary: () => ipcRenderer.invoke('library'),
  storeArt: (appid) => ipcRenderer.invoke('storeArt', appid),
  launch: (appid) => ipcRenderer.invoke('launch', appid),
});
