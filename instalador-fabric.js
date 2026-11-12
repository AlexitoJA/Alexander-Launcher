const fs = require("fs");
const path = require("path");

async function instalarFabric(raiz, version, loader, estado) {
  const perfil = `fabric-loader-${loader}-${version}`;

  const carpeta = path.join(
    raiz, "versions", perfil
  );

  const destino = path.join(
    carpeta, perfil + ".json"
  );

  if (fs.existsSync(destino)) {
    estado("Fabric ya está instalado.");
    return perfil;
  }

  estado("Descargando perfil de Fabric...");

  const url =
    `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}/${encodeURIComponent(loader)}/profile/json`;

  const respuesta = await fetch(url);

  if (!respuesta.ok) {
    throw new Error(
      `No se pudo obtener Fabric. HTTP ${respuesta.status}`
    );
  }

  const perfilJSON = await respuesta.json();

  if (perfilJSON.id !== perfil) {
    throw new Error(
      "El perfil recibido no coincide con la versión solicitada."
    );
  }

  fs.mkdirSync(carpeta, { recursive: true });

  fs.writeFileSync(
    destino,
    JSON.stringify(perfilJSON, null, 2)
  );

  estado("Perfil de Fabric preparado.");

  return perfil;
}

module.exports = { instalarFabric };