
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const { Client, Authenticator } = require("minecraft-launcher-core");
const { actualizarMods } = require("./actualizador-mods");

// ========================================
// CONFIGURACIÓN
// ========================================

const VERSION = "26.2";
const FABRIC = "fabric-loader-0.20.1-26.2";

const JAVA =
  "C:\\Users\\DELL\\AppData\\Local\\Programs\\Eclipse Adoptium\\jdk-25.0.5.8-hotspot\\bin\\java.exe";

let ocupado = false;
let intervalo = null;

// ========================================
// COMUNICACIÓN CON EL LAUNCHER
// ========================================

function enviar(tipo, texto) {
  if (process.connected) {
    try {
      process.send({ tipo, texto });
    } catch (error) {
      console.error("[IPC]", error.message);
    }
  }
}

function estado(texto) {
  enviar("estado", texto);
}

// ========================================
// DETECTAR VENTANA DE MINECRAFT
// ========================================

function detenerDetector() {
  if (intervalo) {
    clearInterval(intervalo);
  }

  intervalo = null;
}

function detectarVentana(proceso) {
  if (process.platform !== "win32") {
    return;
  }

  let intentos = 0;
  let consultando = false;

  const script = `
    $procesos = Get-Process java,javaw -ErrorAction SilentlyContinue |
      Where-Object {
        $_.MainWindowHandle -ne 0 -and
        $_.MainWindowTitle -like '*Minecraft*'
      }

    if ($procesos) {
      Write-Output 'MINECRAFT_ABIERTO'
    }
  `;

  intervalo = setInterval(() => {
    if (consultando) {
      return;
    }

    intentos++;

    if (intentos > 90) {
      detenerDetector();
      return;
    }

    consultando = true;

    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script
      ],
      {
        windowsHide: true,
        timeout: 5000
      },
      (error, salida) => {
        consultando = false;

        if (
          !error &&
          salida &&
          salida.includes("MINECRAFT_ABIERTO")
        ) {
          detenerDetector();

          enviar("ventana", "Minecraft abierto");
        }
      }
    );
  }, 2000);

  proceso.once("exit", detenerDetector);
}

// ========================================
// INICIAR MINECRAFT
// ========================================

async function iniciar({ jugador, ram }) {
  const raiz = path.join(__dirname, "minecraft");

  // ====================================
  // COMPROBAR ARCHIVOS
  // ====================================

  const archivos = [
    path.join(
      raiz,
      "versions",
      VERSION,
      VERSION + ".jar"
    ),

    path.join(
      raiz,
      "versions",
      VERSION,
      VERSION + ".json"
    ),

    path.join(
      raiz,
      "versions",
      FABRIC,
      FABRIC + ".json"
    )
  ];

  for (const archivo of archivos) {
    if (!fs.existsSync(archivo)) {
      throw new Error(
        "Falta el archivo: " + path.basename(archivo)
      );
    }
  }

  if (!fs.existsSync(JAVA)) {
    throw new Error("No se encontró Java 25.");
  }

  // ====================================
  // ACTUALIZACIÓN INTELIGENTE DE MODS
  // ====================================

  estado("Buscando mods nuevos o actualizados...");

  const resultado = await actualizarMods(raiz);

  console.log("[MODS]", resultado);

  estado("Mods comprobados. Preparando Minecraft...");

  // ====================================
  // CLIENTE DE MINECRAFT
  // ====================================

  const cliente = new Client();

  let ultimoProgreso = 0;

  cliente.on("debug", mensaje => {
    const texto = String(mensaje);

    if (texto.includes("Launching with arguments")) {
      return;
    }

    if (
      texto.includes("Downloaded assets") ||
      texto.includes("Using Java version")
    ) {
      console.log("[DEBUG]", texto);
    }
  });

  // ====================================
  // PROGRESO DE ARCHIVOS
  // ====================================

  cliente.on("progress", progreso => {
    const ahora = Date.now();

    if (ahora - ultimoProgreso >= 2000) {
      ultimoProgreso = ahora;

      console.log("[PROGRESO]", progreso);

      if (progreso && progreso.total > 0) {
        estado(
          "Preparando " +
          progreso.type +
          ": " +
          progreso.task +
          "/" +
          progreso.total
        );
      }
    }
  });

  // ====================================
  // MENSAJES DEL JUEGO
  // ====================================

  cliente.on("data", mensaje => {
    const texto = String(mensaje);

    if (/ERROR|Exception|Caused by:/i.test(texto)) {
      console.log("[JUEGO]", texto);
    }
  });

  // ====================================
  // CIERRE DE MINECRAFT
  // ====================================

  cliente.on("close", codigo => {
    detenerDetector();

    estado(
      "Minecraft se cerró. Código: " + codigo
    );

    process.exitCode = 0;
  });

  // ====================================
  // OPCIONES DE MINECRAFT
  // ====================================

  const opciones = {
    authorization: Authenticator.getAuth(jugador),

    root: raiz,

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

  estado("Iniciando Minecraft con Fabric...");

  const proceso = await cliente.launch(opciones);

  if (!proceso || typeof proceso.on !== "function") {
    throw new Error(
      "No se creó el proceso de Minecraft."
    );
  }

  proceso.on("error", error => {
    detenerDetector();

    enviar("error", error.message);
  });

  enviar("iniciado", "Minecraft se está iniciando");

  detectarVentana(proceso);
}

// ========================================
// RECIBIR ORDEN DE INICIO
// ========================================

process.on("message", async mensaje => {
  if (
    !mensaje ||
    mensaje.tipo !== "iniciar" ||
    ocupado
  ) {
    return;
  }

  ocupado = true;

  try {
    await iniciar(mensaje);
  } catch (error) {
    console.error("[ERROR]", error);

    enviar("error", error.message);

    process.exitCode = 1;
  }
});
