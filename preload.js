
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("alexander", {
  iniciarJuego: datos =>
    ipcRenderer.invoke("iniciar-juego", datos),

  estadoServidor: () =>
    ipcRenderer.invoke("estado-servidor"),

  copiarServidor: () =>
    ipcRenderer.invoke("copiar-servidor"),

  escucharEstado: callback => {
    ipcRenderer.on("estado-juego", (_evento, mensaje) => {
      callback(mensaje);
    });
  },

  escucharMods: callback => {
    ipcRenderer.on("estado-mods", (_evento, datos) => {
      callback(datos);
    });
  },

  obtenerEstadoMods: () =>
    ipcRenderer.invoke("obtener-estado-mods")
});
