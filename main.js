
const { app, BrowserWindow, ipcMain, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const { Client, Authenticator } = require("minecraft-launcher-core");
const { estadoServidor } = require("./estado-servidor");
const { actualizarMods } = require("./actualizador-mods");
const { prepararMinecraft } = require("./instalador-minecraft");
const { instalarFabric } = require("./instalador-fabric");
const { detectarJava } = require("./detector-java");
const { instalarJava } = require("./instalador-java");
const { iniciarActualizador } = require("./actualizador-launcher");
const { recursosCompletos } = require("./cache-assets");
const Handler = require("minecraft-launcher-core/components/handler");

// ========================================
// OPTIMIZACIÓN DE RECURSOS
// ========================================

const getAssetsOriginal = Handler.prototype.getAssets;

Handler.prototype.getAssets = async function (...args) {
  const raizJuego = this.options.root;
  const versionAssets =
    this.options.version.custom || this.options.version.number;

  if (recursosCompletos(raizJuego, versionAssets)) {
    console.log("[ALEXANDER] Inicio rápido: recursos presentes.");
    return;
  }

  console.log("[ALEXANDER] Descargando o verificando recursos...");
  return getAssetsOriginal.apply(this, args);
};

// ========================================
// CONFIGURACIÓN
// ========================================

const SERVIDOR = "ALEXANDERGGXD-QR4g.aternos.me";
const VERSION = "26.2";
const FABRIC = "fabric-loader-0.20.1-26.2";

let ventana = null;
let juegoIniciando = false;
let estadoMods = {
  estado: "comprobando",
  mensaje: "Comprobando mods de GitHub..."
};

function publicarEstadoMods(estado, mensaje, porcentaje = null) {
  estadoMods = {
    estado,
    mensaje,
    porcentaje
  };

  if (ventana && !ventana.isDestroyed()) {
    ventana.webContents.send("estado-mods", estadoMods);
  }
}

ipcMain.handle("obtener-estado-mods", () => estadoMods);
let juegoActivo = false;
let minecraft = null;
let comprobadorVentana = null;
let promesaMods = null;

function obtenerCarpetaMinecraft() {
  return path.join(
    app.getPath("appData"),
    "AlexanderLauncher",
    "minecraft"
  );
}


function comprobarMods() {
  if (promesaMods) return promesaMods;

  promesaMods = (async () => {
    publicarEstadoMods(
      "comprobando",
      "Comprobando mods de GitHub..."
    );

const resultado = await actualizarMods(
  obtenerCarpetaMinecraft(),
  datos => {
    publicarEstadoMods(
      "comprobando",
      `Comprobando mods: ${datos.procesados}/${datos.total}`,
      datos.porcentaje
    );
  }
);

    console.log("[MODS] Sincronización completada:", resultado);

    publicarEstadoMods(
      "listo",
      `${resultado.total} mods comprobados. Listo para jugar.`
    );

    return resultado;
  })();

  promesaMods.catch(error => {
    console.error("[MODS] Error:", error);

    publicarEstadoMods(
      "error",
      "Error al actualizar mods: " + error.message
    );
  }).finally(() => {
    promesaMods = null;
  });

  return promesaMods;
}

// ========================================
// VENTANA DEL LAUNCHER
// ========================================

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#090d16",
    title: "Minecraft Extremo",

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  ventana.setMenu(null);
  ventana.maximize();
  ventana.loadFile(path.join(__dirname, "index.html"));

  ventana.once("ready-to-show", () => {
    if (ventana && !ventana.isDestroyed()) {
      ventana.show();
    }
  });
}

// ========================================
// ELECTRON
// ========================================

app.whenReady().then(() => {
  crearVentana();
  iniciarActualizador();

  ventana.webContents.once("did-finish-load", () => {
    comprobarMods().catch(error => {
      console.error("[MODS] Error inicial:", error.message);
    });
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    crearVentana();
  }
});

// ========================================
// MENSAJES
// ========================================

function enviarEstado(mensaje) {
  console.log("[MINECRAFT EXTREMO]", mensaje);

  if (ventana && !ventana.isDestroyed()) {
    ventana.webContents.send("estado-juego", mensaje);
  }
}

// ========================================
// ESTADO DEL SERVIDOR
// ========================================

ipcMain.handle("estado-servidor", async () => {
  return await estadoServidor();
});

// ========================================
// COPIAR IP DEL SERVIDOR
// ========================================

ipcMain.handle("copiar-servidor", () => {
  clipboard.writeText(SERVIDOR);
  return true;
});

// ========================================
// DETECTAR VENTANA DE MINECRAFT
// ========================================

function detenerComprobacion() {
  if (comprobadorVentana) {
    clearInterval(comprobadorVentana);
    comprobadorVentana = null;
  }
}

function detectarMinecraft(proceso) {
  if (process.platform !== "win32") {
    return;
  }

  detenerComprobacion();

  let intentos = 0;
  let comprobando = false;

  const script = `
    $procesos = Get-Process java,javaw -ErrorAction SilentlyContinue |
      Where-Object {
        $_.MainWindowHandle -ne 0 -and
        $_.MainWindowTitle -like '*Minecraft*'
      }

    if ($procesos) {
      Write-Output "MINECRAFT_ABIERTO"
    }
  `;

  comprobadorVentana = setInterval(() => {
    if (!juegoActivo) {
      detenerComprobacion();
      return;
    }

    if (comprobando) {
      return;
    }

    intentos++;
    comprobando = true;

    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script
      ],
      {
        timeout: 5000,
        windowsHide: true
      },
      (error, salida) => {
        comprobando = false;

        if (!juegoActivo || !comprobadorVentana) {
          return;
        }

        if (!error && salida.includes("MINECRAFT_ABIERTO")) {
          detenerComprobacion();

          console.log(
            "[ALEXANDER] Ventana de Minecraft detectada."
          );

          enviarEstado(
            "Minecraft abierto. Cerrando Alexander Launcher..."
          );

          if (ventana && !ventana.isDestroyed()) {
            ventana.close();
          }

          return;
        }

        if (intentos >= 90) {
          detenerComprobacion();

          console.log(
            "[ALEXANDER] No se detectó la ventana de Minecraft."
          );
        }
      }
    );
  }, 2000);

  proceso.once("exit", () => {
    detenerComprobacion();
  });
}

// ========================================
// INICIAR MINECRAFT
// ========================================

ipcMain.handle("iniciar-juego", async (_evento, datos) => {
  if (juegoIniciando || juegoActivo) {
    return {
      ok: false,
      mensaje: "Minecraft ya está abierto o iniciándose."
    };
  }

  const jugador = String(datos?.jugador || "").trim();
  const ram = Number(datos?.ram);

  // ====================================
  // VALIDAR NOMBRE
  // ====================================

  if (!/^[a-zA-Z0-9_]{3,16}$/.test(jugador)) {
    return {
      ok: false,
      mensaje: "El nombre debe tener entre 3 y 16 caracteres."
    };
  }

  // ====================================
  // VALIDAR RAM
  // ====================================

  if (![4, 6, 8, 10, 12].includes(ram)) {
    return {
      ok: false,
      mensaje: "Selecciona una cantidad de RAM válida."
    };
  }

  const raiz = path.join(
    app.getPath("appData"),
    "AlexanderLauncher",
    "minecraft"
  );

  // ====================================
  // COMPROBAR INSTALACIÓN
  // ====================================

  const archivoJar = path.join(
    raiz, "versions", VERSION, VERSION + ".jar"
  );

  const archivoJson = path.join(
    raiz, "versions", VERSION, VERSION + ".json"
  );

  const perfilFabric = path.join(
    raiz, "versions", FABRIC, FABRIC + ".json"
  );

  fs.mkdirSync(raiz, { recursive: true });

  const faltaMinecraft =
    !fs.existsSync(archivoJar) ||
    !fs.existsSync(archivoJson);

  const faltaFabric = !fs.existsSync(perfilFabric);


  // ====================================
  // COMPROBAR E INSTALAR JAVA 25
  // ====================================

  juegoIniciando = true;

  try {
    enviarEstado("Comprobando Java 25...");

    const JAVA = await instalarJava(enviarEstado);

    if (!JAVA || !fs.existsSync(JAVA)) {
      throw new Error("No se pudo preparar Java 25.");
    }

    console.log("[ALEXANDER] Java listo:", JAVA);

    // ====================================
    // INSTALACIÓN AUTOMÁTICA
    // ====================================


    if (faltaMinecraft) {
      enviarEstado("Descargando Minecraft " + VERSION + "...");

      await prepararMinecraft(
        raiz,
        VERSION,
        enviarEstado
      );
    }

    if (faltaFabric) {
      enviarEstado("Instalando Fabric 0.20.1...");

      await instalarFabric(
        raiz,
        VERSION,
        "0.20.1",
        enviarEstado
      );
    }

    for (const archivo of [
      archivoJar,
      archivoJson,
      perfilFabric
    ]) {
      if (!fs.existsSync(archivo)) {
        throw new Error(
          "No se pudo preparar: " + path.basename(archivo)
        );
      }
    }

    // ====================================
    // ACTUALIZACIÓN DE MODS
    // ====================================

    enviarEstado("Buscando mods nuevos o actualizados...");

    console.log("[ALEXANDER] Consultando GitHub...");

const resultadoMods = await comprobarMods();

    console.log(
      "[ALEXANDER] Resultado de mods:",
      resultadoMods
    );

    enviarEstado(
      "Mods comprobados. Preparando Minecraft..."
    );

    // ====================================
    // CREAR CLIENTE MINECRAFT
    // ====================================

    minecraft = new Client();

    let ultimoEstadoDescarga = 0;

    minecraft.on("progress", progreso => {
      if (!progreso || !progreso.total) return;

      const ahora = Date.now();

      if (
        ahora - ultimoEstadoDescarga < 1200 &&
        progreso.task !== progreso.total
      ) {
        return;
      }

      ultimoEstadoDescarga = ahora;

      const etiquetas = {
        assets: "Recursos de Minecraft",
        classes: "Librerías de Minecraft",
        "classes-custom": "Librerías de Fabric",
        "classes-maven-custom": "Dependencias de Fabric"
      };

      const etiqueta = etiquetas[progreso.type];

      if (etiqueta) {
        enviarEstado(
          `${etiqueta}: ${progreso.task}/${progreso.total}`
        );
      }
    });

    minecraft.on("download-status", datos => {
      console.log("[DESCARGA MINECRAFT]", datos);
    });

    let inicioAssets = 0;

    minecraft.on("progress", datos => {
      if (datos.type === "assets") {
        if (datos.task === 0) {
          inicioAssets = Date.now();
          console.log("[VELOCIDAD] Revisando recursos...");
        }

        if (datos.task === datos.total && inicioAssets) {
          const segundos = (
            (Date.now() - inicioAssets) / 1000
          ).toFixed(2);

          console.log(
            "[VELOCIDAD] Recursos revisados en " +
            segundos + " segundos"
          );

          inicioAssets = 0;
        }
      }
    });

    // ====================================
    // MENSAJES DE DEPURACIÓN
    // ====================================

    minecraft.on("debug", mensaje => {
      const texto = String(mensaje);

      if (texto.includes("Launching with arguments")) {
        console.log("[DEBUG] Preparando Minecraft...");
        return;
      }

      if (
        texto.includes("Collected class paths") ||
        texto.includes("Downloaded assets") ||
        texto.includes("Set launch options") ||
        texto.includes("Using Java version")
      ) {
        console.log("[DEBUG]", texto);
      }
    });

    // ====================================
    // MENSAJES DEL JUEGO
    // ====================================

    let ultimoMensajeJuego = 0;

    minecraft.on("data", mensaje => {
      const texto = String(mensaje);

      if (
        texto.includes("ERROR") ||
        texto.includes("Exception") ||
        texto.includes("Caused by:")
      ) {
        console.log("[JUEGO]", texto);
        return;
      }

      const ahora = Date.now();

      if (ahora - ultimoMensajeJuego >= 3000) {
        console.log("[JUEGO]", texto);
        ultimoMensajeJuego = ahora;
      }
    });

    // ====================================
    // EVENTOS DE DESCARGA
    // ====================================

    let cantidadDescargas = 0;

    minecraft.on("download", () => {
      cantidadDescargas++;

      if (cantidadDescargas === 1) {
        console.log(
          "[DESCARGA] Preparando archivos necesarios..."
        );
      }
    });

    let ultimoProgreso = 0;

    minecraft.on("progress", progreso => {
      const ahora = Date.now();

      if (ahora - ultimoProgreso >= 2000) {
        console.log("[PROGRESO]", progreso);
        ultimoProgreso = ahora;
      }
    });

    // ====================================
    // DETECTAR CIERRE DEL JUEGO
    // ====================================

    minecraft.on("close", codigo => {
      juegoActivo = false;
      juegoIniciando = false;

      detenerComprobacion();

      enviarEstado(
        "Minecraft se cerró. Código: " + codigo
      );
    });

    // ====================================
    // CONFIGURACIÓN DEL JUEGO
    // ====================================

    const opciones = {
      authorization: Authenticator.getAuth(jugador),

      root: raiz,

      overrides: {
        minecraftJar: path.join(
          raiz,
          "versions",
          VERSION,
          VERSION + ".jar"
        )
      },

      javaPath: JAVA,

      version: {
        number: VERSION,
        type: "release",
        custom: FABRIC
      },

      memory: {
        min: "2G",
        max: ram + "G"
      }
    };

    // ====================================
    // EJECUTAR MINECRAFT
    // ====================================

    enviarEstado(
      "Preparando librerías y recursos de Minecraft..."
    );

    const assetsListos = recursosCompletos(raiz, FABRIC);

    console.log(
      assetsListos
        ? "[ALEXANDER] Recursos presentes."
        : "[ALEXANDER] Recursos incompletos."
    );

    const proceso = await minecraft.launch(opciones);

    if (!proceso || typeof proceso.on !== "function") {
      throw new Error(
        "No se creó el proceso de Minecraft."
      );
    }

    juegoActivo = true;
    juegoIniciando = false;

    proceso.on("error", error => {
      juegoActivo = false;
      juegoIniciando = false;

      detenerComprobacion();

      console.error("[ERROR JAVA]", error);

      enviarEstado(
        "Error de Minecraft: " + error.message
      );
    });

    // ====================================
    // CERRAR LAUNCHER AL ABRIR MINECRAFT
    // ====================================

    detectarMinecraft(proceso);

    enviarEstado("Minecraft se está iniciando...");

    return {
      ok: true,
      mensaje: "Minecraft se está iniciando."
    };

  } catch (error) {
    juegoIniciando = false;
    juegoActivo = false;

    detenerComprobacion();

    console.error("[ERROR AL INICIAR]", error);

    const mensaje = "Error: " + error.message;

    enviarEstado(mensaje);

    return {
      ok: false,
      mensaje
    };
  }
});
