/** @type {import('electron-builder').Configuration} */
const packageVersion = require("./package.json").version;
const isPrerelease = packageVersion.includes("-");

module.exports = {
  appId: "ai.hika.desktop",
  productName: "Hikanest",
  copyright: "Copyright © 2025 Hikanest",

  directories: {
    output: "release",
    buildResources: "assets",
  },

  files: [
    "dist/electron/**/*",
    "node_modules/**/*",
    "package.json",
  ],

  extraResources: [
    { from: "overlay", to: "overlay" },
    { from: "assets", to: "assets", filter: ["**/*"] },
  ],

  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "icon.ico",
    artifactName: "Hikanest-Setup.${ext}",
    // Code Signing: electron-builder automatically signs when
    // CSC_LINK (base64 .pfx) and CSC_KEY_PASSWORD are set as env vars.
    signtoolOptions: {
      signingHashAlgorithms: ["sha256"],
    },
  },

  publish: {
    provider: "github",
    owner: "KRIORA2",
    repo: "Meeting-Hika-Assist",
    releaseType: isPrerelease ? "prerelease" : "release",
  },

  mac: {
    target: [{ target: "dmg", arch: ["x64", "arm64"] }],
    icon: "icon.icns",
    artifactName: "Hikanest-${version}.${ext}",
    category: "public.app-category.business",
  },

  linux: {
    target: [{ target: "AppImage", arch: ["x64"] }],
    icon: "icon.png",
    category: "Office",
  },

  nsis: {
    oneClick: true,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: false,
    installerIcon: "icon.ico",
    uninstallerIcon: "icon.ico",
    installerHeaderIcon: "icon.ico",
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Hikanest",
  },
};
