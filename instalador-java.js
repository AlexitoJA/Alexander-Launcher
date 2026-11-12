const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

const { detectarJava, comprobarJava } = require("./detector-java");

const API =
  "https://api.adoptium.net/v3/assets/latest/25/hotspot" +
  "?architecture=x64&image_type=jdk&os=windows" +
  "&vendor=eclipse";

function obtener(url, destino, redirecciones = 0) {
  return new Promise((resolve, reject) => {
    if (redirecciones > 8) {
      return reject(new Error("Demasiadas redirecciones."));
    }

    if (!url.startsWith("https://")) {
      return reject(new Error("URL de descarga no segura."));
    }

    https.get(url, { timeout: 30000 }, respuesta => {
      if ([301, 302, 303, 307, 308].includes(respuesta.statusCode)) {
        const siguiente = new URL(
          respuesta.headers.location,
          url
        ).toString();

        respuesta.resume();

        return resolve(
          obtener(siguiente, destino, redirecciones + 1)
        );
      }

      if (respuesta.statusCode !== 200) {
        respuesta.resume();
        return reject(
          new Error("HTTP " + respuesta.statusCode)
        );
      }

      if (!destino) {
        let contenido = "";

        respuesta.on("data", parte => {
          contenido += parte.toString();
        });

        respuesta.on("end", () => resolve(contenido));
        respuesta.on("error", reject);
        return;
      }

      const archivo = fs.createWriteStream(destino);

      respuesta.pipe(archivo);

      archivo.on("finish", () => {
        archivo.close(() => resolve(destino));
      });

      respuesta.on("error", error => {
        archivo.destroy();
        reject(error);
      });

      archivo.on("error", reject);
    }).on("error", reject);
  });
}

async function instalarJava(enviarEstado = () => {}) {
  const existente = detectarJava();

  if (existente) {
    enviarEstado("Java 25 encontrado.");
    return existente;
  }

  if (process.platform !== "win32" ||
      process.arch !== "x64") {
    throw new Error(
      "Este instalador de Java requiere Windows de 64 bits."
    );
  }

  const base = path.join(
    process.env.APPDATA || os.homedir(),
    "AlexanderLauncher"
  );

  const carpetaJava = path.join(base, "java");
  const carpetaTemporal = path.join(base, "java-temporal");
  const zipTemporal = path.join(base, "java25.zip");

  fs.mkdirSync(base, { recursive: true });

  try {
    enviarEstado("Consultando Java 25 oficial...");

    const versiones = JSON.parse(await obtener(API));

    const paquete = versiones.find(
      item =>
        item.binary &&
        item.binary.package &&
        item.binary.package.link &&
        item.binary.package.checksum
    );

    if (!paquete) {
      throw new Error("No se encontr� Java 25 para Windows.");
    }

    enviarEstado("Descargando Java 25...");

    await obtener(paquete.binary.package.link, zipTemporal);

    enviarEstado("Verificando Java 25...");

    const hash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(zipTemporal))
      .digest("hex");

    if (
      hash.toLowerCase() !==
      paquete.binary.package.checksum.toLowerCase()
    ) {
      throw new Error(
        "La verificaci�n SHA-256 de Java fall�."
      );
    }

    enviarEstado("Extrayendo Java 25...");

    fs.rmSync(carpetaTemporal, {
      recursive: true,
      force: true
    });

    fs.mkdirSync(carpetaTemporal, { recursive: true });

    const zip = new AdmZip(zipTemporal);

    // Evitar rutas peligrosas dentro del ZIP
    for (const entrada of zip.getEntries()) {
      const nombre = entrada.entryName.replace(/\\/g, "/");

      if (
        nombre.startsWith("/") ||
        nombre.split("/").includes("..") ||
        /^[a-zA-Z]:/.test(nombre)
      ) {
        throw new Error("El ZIP contiene una ruta no v�lida.");
      }
    }

    zip.extractAllTo(carpetaTemporal, true);

    const carpetas = fs.readdirSync(carpetaTemporal, {
      withFileTypes: true
    }).filter(item => item.isDirectory());

    const encontrada = carpetas
      .map(item => path.join(carpetaTemporal, item.name))
      .find(carpeta =>
        fs.existsSync(
          path.join(carpeta, "bin", "java.exe")
        )
      );

    if (!encontrada) {
      throw new Error(
        "No se encontr� java.exe dentro del ZIP."
      );
    }

    const ejecutable = path.join(
      encontrada,
      "bin",
      "java.exe"
    );

    if (!comprobarJava(ejecutable)) {
      throw new Error(
        "El Java descargado no corresponde a Java 25."
      );
    }

    fs.rmSync(carpetaJava, {
      recursive: true,
      force: true
    });

    fs.renameSync(encontrada, carpetaJava);

    enviarEstado("Java 25 instalado correctamente.");

    return path.join(
      carpetaJava,
      "bin",
      "java.exe"
    );

  } finally {
    fs.rmSync(zipTemporal, { force: true });

    fs.rmSync(carpetaTemporal, {
      recursive: true,
      force: true
    });
  }
}

module.exports = { instalarJava };