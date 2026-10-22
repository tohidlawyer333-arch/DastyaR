const { contextBridge, ipcRenderer } = require('electron');
const allowedEvents = ['agent:update', 'agent:status', 'agent:log', 'agent:permission-request'];
contextBridge.exposeInMainWorld('dastyar', {
  vaultStatus: () => ipcRenderer.invoke('vault:status'),
  createVault: (passphrase) => ipcRenderer.invoke('vault:create', passphrase),
  unlockVault: (passphrase) => ipcRenderer.invoke('vault:unlock', passphrase),
  getVault: () => ipcRenderer.invoke('vault:get'),
  saveVault: (data) => ipcRenderer.invoke('vault:save', data),
  lockVault: () => ipcRenderer.invoke('vault:lock'),
  getProvider: () => ipcRenderer.invoke('provider:get'),
  saveProvider: (data) => ipcRenderer.invoke('provider:save', data),
  openProviderPage: (provider) => ipcRenderer.invoke('provider:open-page', provider),
  importFiles: (options) => ipcRenderer.invoke('file:import', options),
  importFolder: (options) => ipcRenderer.invoke('file:import-folder', options),
  exportFile: (id) => ipcRenderer.invoke('file:export', id),
  saveRecording: (data) => ipcRenderer.invoke('recording:save', data),
  openPortal: () => ipcRenderer.invoke('portal:open'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  revealData: () => ipcRenderer.invoke('app:reveal-data'),
  sendAgentPrompt: (payload) => ipcRenderer.invoke('agent:send', payload),
  stopAgent: () => ipcRenderer.invoke('agent:stop'),
  answerPermission: (answer) => ipcRenderer.invoke('agent:permission-answer', answer),
  on(channel, callback) {
    if (!allowedEvents.includes(channel) || typeof callback !== 'function') return () => {};
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
