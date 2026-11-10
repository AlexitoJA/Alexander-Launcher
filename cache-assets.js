const fs = require("fs");
const path = require("path");

function recursosCompletos(raiz, version) {
  const indice = path.join(
    raiz, "assets", "indexes", `${version}.json`
  );

  if (!fs.existsSync(indice)) return false;

  try {
    const datos = JSON.parse(fs.readFileSync(indice, "utf8"));

    return Object.values(datos.objects).every(({ hash }) => {
      const archivo = path.join(
        raiz, "assets", "objects", hash.slice(0, 2), hash
      );

      return fs.existsSync(archivo);
    });
  } catch {
    return false;
  }
}

module.exports = { recursosCompletos };