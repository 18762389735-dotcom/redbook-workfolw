// Intentionally empty: the renderer does not need Node or custom IPC APIs.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const api = {
  isDesktop: true,
  openXhs: () => invoke('desktop:open-xhs'),
  getXhsStatus: () => invoke('desktop:xhs-status'),
  collectVisible: () => invoke('desktop:collect-visible'),
  collectCreator: () => invoke('desktop:collect-creator'),
  syncAccountProfile: () => invoke('desktop:sync-account-profile'),
  collectCreatorBaseline: (limit) => invoke('desktop:collect-creator-baseline', limit),
  cancelCollectorTask: (taskId) => invoke('desktop:cancel-collector-task', taskId),
  listCollectorTasks: () => invoke('desktop:list-collector-tasks'),
  onCollectorTaskChanged(callback) {
    const listener = (_event, task) => callback(task);
    ipcRenderer.on('desktop:collector-task-changed', listener);
    return () => ipcRenderer.removeListener('desktop:collector-task-changed', listener);
  },
  onXhsStatusChanged(callback) {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('desktop:xhs-status-changed', listener);
    return () => ipcRenderer.removeListener('desktop:xhs-status-changed', listener);
  },
};
contextBridge.exposeInMainWorld('redbookDesktop', Object.freeze(api));
