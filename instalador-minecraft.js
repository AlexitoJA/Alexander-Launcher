
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

function obtenerJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000 }, respuesta => {
      if (respuesta.statusCode !== 200) {
        respuesta.resume();
        return reject(new Error(
          "Error HTTP " + respuesta.statusCode
        ));
      }

      let datos = "";
      respuesta.setEncoding("utf8");

      respuesta.on("data", fragmento => {
        datos += fragmento;
      });

      respuesta.on("end", () => {
        try {
          resolve(JSON.parse(datos));
        } catch (error) {
          reject(error);
        }
      });

      respuesta.on("error", reject);
    }).on("error", reject);
  });
}

async function descargarArchivo(url, destino, sha1) {
  fs.mkdirSync(path.dirname(destino), {
    recursive: true
  });

  const temporal = destino + ".descarga";

  if (fs.existsSync(destino)) {
    if (!sha1) return;

    const actual = crypto
      .createHash("sha1")
      .update(fs.readFileSync(destino))
      .digest("hex");

    if (actual === sha1) return;
  }

  const respuesta = await fetch(url);

  if (!respuesta.ok) {
    throw new Error(
      "Descarga fallida: HTTP " + respuesta.status
    );
  }

  try {
    const datos = Buffer.from(
      await respuesta.arrayBuffer()
    );

    if (sha1) {
      const obtenido = crypto
        .createHash("sha1")
        .update(datos)
        .digest("hex");

      if (obtenido !== sha1) {
        throw new Error("SHA1 incorrecto");
      }
    }

    fs.writeFileSync(temporal, datos);
    fs.renameSync(temporal, destino);
  } finally {
    if (fs.existsSync(temporal)) {
      fs.unlinkSync(temporal);
    }
  }
}

async function prepararMinecraft(raiz, version, estado) {
  estado("Consultando versiones oficiales...");

  const manifiesto = await obtenerJSON(
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
  );

  const seleccionada = manifiesto.versions.find(
    item => item.id === version
  );

  if (!seleccionada) {
    throw new Error(
      "La versión " + version +
      " no aparece en el manifiesto oficial."
    );
  }

  const carpetaVersion = path.join(
    raiz, "versions", version
  );

  const archivoJSON = path.join(
    carpetaVersion, version + ".json"
  );

  const archivoJAR = path.join(
    carpetaVersion, version + ".jar"
  );

  estado("Preparando Minecraft " + version + "...");

  const metadata = await obtenerJSON(seleccionada.url);

  fs.mkdirSync(carpetaVersion, {
    recursive: true
  });

  fs.writeFileSync(
    archivoJSON,
    JSON.stringify(metadata, null, 2)
  );

  await descargarArchivo(
    metadata.downloads.client.url,
    archivoJAR,
    metadata.downloads.client.sha1
  );

  estado("Minecraft base descargado correctamente.");
}

module.exports = { prepararMinecraft };
