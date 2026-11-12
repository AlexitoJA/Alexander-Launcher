
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const BASE = "https://raw.githubusercontent.com/AlexitoJA/Alexander-Launcher/main/modpack/";

let cache = null;
let cacheHasta = 0;

// ========================================
// DESCARGAR ARCHIVOS
// ========================================

function descargar(url, saltos = 0) {
  return new Promise((resolve, reject) => {
    if (saltos > 5) {
      return reject(new Error("Demasiadas redirecciones"));
    }

    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Minecraft-Hardcore"
        },
        timeout: 30000
      },
      res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const destino = new URL(res.headers.location, url);
          res.resume();

          if (destino.protocol !== "https:") {
            return reject(new Error("Redireccion insegura"));
          }

          return resolve(descargar(destino.href, saltos + 1));
        }

        if (res.statusCode !== 200) {
          res.resume();

          return reject(
            new Error(`HTTP ${res.statusCode} descargando ${url}`)
          );
        }

        const partes = [];

        res.on("data", parte => partes.push(parte));
        res.on("end", () => resolve(Buffer.concat(partes)));
        res.on("error", reject);
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Tiempo de espera agotado"));
    });

    req.on("error", reject);
  });
}

// ========================================
// VERIFICAR SHA256
// ========================================

function hash(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

// ========================================
// VALIDAR RUTAS
// ========================================

function validarRuta(ruta) {
  if (
    typeof ruta !== "string" ||
    !ruta ||
    ruta.length > 400
  ) {
    throw new Error("Ruta invalida");
  }

  const partes = ruta.split("/");

  if (
    partes.some(parte =>
      !parte ||
      parte === "." ||
      parte === ".." ||
      /[\\:*?"<>|\x00-\x1f]/.test(parte) ||
      /[. ]$/.test(parte)
    )
  ) {
    throw new Error("Ruta insegura: " + ruta);
  }

  return partes;
}

// ========================================
// OBTENER MANIFIESTO DE GITHUB
// ========================================

async function manifiesto() {
  if (cache && Date.now() < cacheHasta) {
    return cache;
  }

  const url =
    BASE +
    "manifest.json?t=" +
    Math.floor(Date.now() / 300000);

  const datos = JSON.parse(
    (await descargar(url)).toString("utf8")
  );

  if (
    datos.version !== 1 ||
    !Array.isArray(datos.archivos)
  ) {
    throw new Error("Manifiesto invalido");
  }

  const rutas = new Set();

  for (const item of datos.archivos) {
    const partes = validarRuta(item.ruta);

    if (
      !["mods", "config"].includes(partes[0]) ||
      partes.length < 2
    ) {
      throw new Error(
        "Archivo fuera de modpack: " + item.ruta
      );
    }

    if (!/^[a-f0-9]{64}$/i.test(item.sha256)) {
      throw new Error(
        "SHA256 invalido: " + item.ruta
      );
    }

    if (rutas.has(item.ruta.toLowerCase())) {
      throw new Error(
        "Ruta duplicada: " + item.ruta
      );
    }

    rutas.add(item.ruta.toLowerCase());
  }

  cache = datos;
  cacheHasta = Date.now() + 5 * 60 * 1000;

  return datos;
}

// ========================================
// PREPARAR CARPETAS
// ========================================

function asegurarDestino(base, partes) {
  let actual = base;

  for (const parte of partes.slice(0, -1)) {
    actual = path.join(actual, parte);

    if (
      fs.existsSync(actual) &&
      !fs.lstatSync(actual).isDirectory()
    ) {
      throw new Error(
        "Carpeta no valida: " + actual
      );
    }

    fs.mkdirSync(actual, { recursive: true });
  }

  const destino = path.join(base, ...partes);

  if (
    fs.existsSync(destino) &&
    !fs.lstatSync(destino).isFile()
  ) {
    throw new Error(
      "Destino no valido: " + destino
    );
  }

  return destino;
}

// ========================================
// SINCRONIZAR MODS Y CONFIGURACIONES
// ========================================

async function sincronizar(
  carpetaMinecraft,
  tipo,
  informarProgreso = () => {}
) {
  if (!["mods", "config"].includes(tipo)) {
    throw new Error("Tipo de sincronizacion invalido");
  }

  const base = path.join(carpetaMinecraft, tipo);

  fs.mkdirSync(base, { recursive: true });

  const items = (await manifiesto()).archivos.filter(
    item => item.ruta.startsWith(tipo + "/")
  );

  const pendientes = [];

  let sinCambios = 0;
  let procesados = 0;

  // ======================================
  // INFORMAR PROGRESO
  // ======================================

  function actualizarProgreso(archivo) {
    const porcentaje =
      items.length === 0
        ? 100
        : Math.round(
            (procesados / items.length) * 100
          );

    informarProgreso({
      tipo,
      porcentaje,
      procesados,
      total: items.length,
      archivo
    });
  }

  actualizarProgreso("Preparando archivos...");

  // ======================================
  // COMPROBAR ARCHIVOS
  // ======================================

  for (const item of items) {
    const partes = validarRuta(item.ruta).slice(1);

    if (
      tipo === "mods" &&
      (
        partes.length !== 1 ||
        !partes[0].toLowerCase().endsWith(".jar")
      )
    ) {
      throw new Error("Mod invalido");
    }

    const destino = asegurarDestino(base, partes);

    if (
      fs.existsSync(destino) &&
      hash(fs.readFileSync(destino)) ===
        item.sha256.toLowerCase()
    ) {
      sinCambios++;
      procesados++;

      actualizarProgreso(item.ruta);
      continue;
    }

    const url =
      BASE +
      item.ruta
        .split("/")
        .map(encodeURIComponent)
        .join("/");

    const contenido = await descargar(url);

    if (
      hash(contenido) !==
      item.sha256.toLowerCase()
    ) {
      throw new Error(
        "Integridad incorrecta: " + item.ruta
      );
    }

    pendientes.push({
      destino,
      contenido,
      ruta: item.ruta
    });

    procesados++;
    actualizarProgreso(item.ruta);
  }

  // ======================================
  // INSTALAR ARCHIVOS DESCARGADOS
  // ======================================

  for (const item of pendientes) {
    const temporal = item.destino + ".descarga";
    const respaldo = item.destino + ".respaldo";

    try {
      fs.writeFileSync(
        temporal,
        item.contenido
      );

      if (fs.existsSync(item.destino)) {
        if (fs.existsSync(respaldo)) {
          throw new Error(
            "Existe un respaldo pendiente: " +
              respaldo
          );
        }

        fs.renameSync(
          item.destino,
          respaldo
        );

        try {
          fs.renameSync(
            temporal,
            item.destino
          );
        } catch (error) {
          fs.renameSync(
            respaldo,
            item.destino
          );

          throw error;
        }

        fs.unlinkSync(respaldo);
      } else {
        fs.renameSync(
          temporal,
          item.destino
        );
      }

      console.log(
        `[${tipo.toUpperCase()}] Instalado: ${item.ruta}`
      );
    } finally {
      if (fs.existsSync(temporal)) {
        fs.unlinkSync(temporal);
      }
    }
  }

  // ======================================
  // ELIMINAR MODS ANTIGUOS ADMINISTRADOS
  // ======================================

  let eliminados = 0;

  if (tipo === "mods") {
    const registro = path.join(
      carpetaMinecraft,
      "mods-administrados.json"
    );

    const anteriores = fs.existsSync(registro)
      ? JSON.parse(
          fs.readFileSync(registro, "utf8")
        )
      : null;

    const actuales = new Set(
      items.map(item =>
        item.ruta.slice(5).toLowerCase()
      )
    );

    if (
      anteriores &&
      anteriores.version === 1 &&
      Array.isArray(anteriores.mods)
    ) {
      for (const nombre of anteriores.mods) {
        if (
          typeof nombre !== "string" ||
          !/^[^\\/:*?"<>|\x00-\x1f]+\.jar$/i.test(nombre) ||
          nombre === ".." ||
          nombre === "."
        ) {
          continue;
        }

        if (
          actuales.has(nombre.toLowerCase())
        ) {
          continue;
        }

        const destino = path.join(
          base,
          nombre
        );

        if (
          fs.existsSync(destino) &&
          fs.lstatSync(destino).isFile()
        ) {
          fs.unlinkSync(destino);
          eliminados++;
        }
      }
    }

    const temporalRegistro = registro + ".tmp";

    fs.writeFileSync(
      temporalRegistro,
      JSON.stringify(
        {
          version: 1,
          mods: items.map(item =>
            item.ruta.slice(5)
          )
        },
        null,
        2
      )
    );

    fs.renameSync(
      temporalRegistro,
      registro
    );
  }

  // ======================================
  // RESULTADO FINAL
  // ======================================

  console.log(
    `[${tipo.toUpperCase()}] ` +
    `${items.length} archivos; ` +
    `${pendientes.length} descargados; ` +
    `${sinCambios} sin cambios; ` +
    `${eliminados} eliminados.`
  );

  return {
    total: items.length,
    descargados: pendientes.length,
    sinCambios,
    eliminados
  };
}

// ========================================
// EXPORTAR FUNCION
// ========================================

module.exports = {
  sincronizar
};
