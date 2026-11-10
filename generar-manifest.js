
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const raiz = path.join(__dirname, "modpack");
const archivos = [];

function recorrer(carpeta, prefijo) {
  if (!fs.existsSync(carpeta)) {
    throw new Error("Falta la carpeta: " + carpeta);
  }

  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = path.join(carpeta, entrada.name);
    const relativo = prefijo + "/" + entrada.name;

    if (entrada.isDirectory()) {
      recorrer(ruta, relativo);
    } else if (entrada.isFile()) {
      if (prefijo === "mods" && !entrada.name.toLowerCase().endsWith(".jar")) {
        continue;
      }

      archivos.push({
        ruta: relativo,
        sha256: crypto.createHash("sha256")
          .update(fs.readFileSync(ruta))
          .digest("hex")
      });
    }
  }
}

recorrer(path.join(raiz, "mods"), "mods");
recorrer(path.join(raiz, "config"), "config");

archivos.sort((a, b) => a.ruta.localeCompare(b.ruta));

fs.writeFileSync(
  path.join(raiz, "manifest.json"),
  JSON.stringify({ version: 1, archivos }, null, 2) + "\n"
);

console.log("Manifiesto generado:", archivos.length, "archivos");

