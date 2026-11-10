
"use strict";

const { sincronizar } = require("./sincronizador-github");

async function actualizarConfig(carpetaMinecraft) {
  console.log("[CONFIG] Comprobando actualizaciones...");

  return await sincronizar(carpetaMinecraft, "config");
}

module.exports = { actualizarConfig };
