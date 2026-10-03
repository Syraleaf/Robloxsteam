const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getLibrary: () => ipcRenderer.invoke('library'),
  launch: (appid) => ipcRenderer.invoke('launch', appid),
});
