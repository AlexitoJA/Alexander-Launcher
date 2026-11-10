
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

function comprobarJava(ruta) {
  if (!ruta || !fs.existsSync(ruta)) return false;

  const resultado = spawnSync(ruta, ["-version"], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true
  });

  const salida =
    String(resultado.stdout || "") +
    String(resultado.stderr || "");

  return resultado.status === 0 &&
    /version ["']?25(?:[.\s"'+-]|$)/i.test(salida);
}

function detectarJava() {
  const candidatos = [];

  // Java privado de Alexander Launcher
  candidatos.push(
    path.join(
      process.env.APPDATA || os.homedir(),
      "AlexanderLauncher",
      "java",
      "bin",
      "java.exe"
    )
  );

  if (process.env.JAVA_HOME) {
    candidatos.push(
      path.join(process.env.JAVA_HOME, "bin", "java.exe")
    );
  }

  const bases = [
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Programs")
      : null,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"]
  ].filter(Boolean);

  for (const base of bases) {
    for (const proveedor of [
      "Eclipse Adoptium",
      "Microsoft",
      "Java"
    ]) {
      const carpeta = path.join(base, proveedor);

      if (!fs.existsSync(carpeta)) continue;

      for (const nombre of fs.readdirSync(carpeta)) {
        candidatos.push(
          path.join(carpeta, nombre, "bin", "java.exe")
        );
      }
    }
  }

  for (const ruta of candidatos) {
    if (comprobarJava(ruta)) {
      return ruta;
    }
  }

  return null;
}

module.exports = {
  detectarJava,
  comprobarJava
};
