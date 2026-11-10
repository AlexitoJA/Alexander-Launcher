
"use strict";

const { sincronizar } = require("./sincronizador-github");

async function actualizarMods(carpetaMinecraft, informarProgreso = () => {}) {
  console.log("[MODPACK] Comprobando mods y configuraciones...");

  // 1. Sincronizar mods
  const mods = await sincronizar(
    carpetaMinecraft,
    "mods",
    informarProgreso
  );

  // 2. Sincronizar configuraciones:
  // FancyMenu, Simple Menu y sus recursos
  console.log("[MODPACK] Sincronizando configuraciones...");

  const config = await sincronizar(
    carpetaMinecraft,
    "config",
    informarProgreso
  );

  console.log("[MODPACK] Sincronización completada.");

  return { mods, config };
}

module.exports = { actualizarMods };
