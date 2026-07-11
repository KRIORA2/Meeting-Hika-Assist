/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "ai.hika.desktop",
  productName: "Hika",
  copyright: "Copyright © 2025 Hika.ai",

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
    icon: "assets/icon.ico",
    artifactName: "Hika-Setup-${version}.${ext}",
  },

  mac: {
    target: [{ target: "dmg", arch: ["x64", "arm64"] }],
    icon: "assets/icon.icns",
    artifactName: "Hika-${version}.${ext}",
    category: "public.app-category.business",
  },

  linux: {
    target: [{ target: "AppImage", arch: ["x64"] }],
    icon: "assets/icon.png",
    category: "Office",
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Hika",
  },
};
