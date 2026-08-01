/** @type {import('electron-builder').Configuration} */
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
    "!node_modules",
  ],

  extraResources: [
    { from: "overlay", to: "overlay" },
    { from: "assets", to: "assets", filter: ["**/*"] },
  ],

  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "icon.ico",
    signAndEditExecutable: false,
    artifactName: "Hikanest-Setup.${ext}",
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
