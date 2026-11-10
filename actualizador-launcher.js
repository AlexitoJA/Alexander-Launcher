
const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const path = require("path");

const archivoLog = path.join(
  app.getPath("userData"),
  "actualizador-debug.log"
);

function registrar(mensaje) {
  const linea = `[${new Date().toISOString()}] ${mensaje}\n`;

  fs.mkdirSync(path.dirname(archivoLog), {
    recursive: true
  });

  fs.appendFileSync(archivoLog, linea);
  console.log(mensaje);
}

function iniciarActualizador() {
  if (!app.isPackaged) {
    console.log("[ACTUALIZADOR] Modo desarrollo.");
    return;
  }

  if (process.platform !== "win32") return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[ACTUALIZADOR] Buscando actualizaciones...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(
      `[ACTUALIZADOR] Nueva versión disponible: ${info.version}`
    );
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[ACTUALIZADOR] Ya está actualizado.");
  });

  autoUpdater.on("download-progress", (progreso) => {
    console.log(
      `[ACTUALIZADOR] Descargando: ${progreso.percent.toFixed(1)}%`
    );
  });

  autoUpdater.on("update-downloaded", async (info) => {
    console.log(
      `[ACTUALIZADOR] Versión ${info.version} descargada.`
    );

    const resultado = await dialog.showMessageBox({
      type: "info",
      title: "Minecraft Hardcore",
      message: `Actualización ${info.version} lista`,
      detail:
        "Minecraft Hardcore descargó una nueva versión. ¿Quieres instalarla ahora?",
      buttons: ["Actualizar ahora", "Después"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    if (resultado.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

 autoUpdater.on("error", (error) => {
  console.error(
    "[ACTUALIZADOR] Error:",
    error.message
  );

  registrar("ERROR: " + error.message);
});
registrar(
  "Buscando actualizaciones. Versión instalada: " +
  app.getVersion()
);
 autoUpdater.checkForUpdates().catch((error) => {
  console.error(
    "[ACTUALIZADOR] No se pudo comprobar:",
    error.message
  );

  registrar("ERROR AL COMPROBAR: " + error.message);
});
}

module.exports = { iniciarActualizador };
