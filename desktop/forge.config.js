module.exports = {
  packagerConfig: {
    asar: true,
    icon: './assets/icon',
    extraResource: ['native'],
    protocols: [
      {
        name: 'Stept Protocol',
        schemes: ['stept']
      }
    ],
    // Ignore these files/folders during packaging
    ignore: [
      /^\/src/,
      /(.eslintrc|\.gitignore|\.gitattributes)/,
      /^\/\.vscode/,
      /^\/assets\/dmg/,
      /(tsconfig|webpack|tailwind).*\.json?$/,
      /^\/forge\.config\.js$/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'stept_desktop'
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'MyFoxIT',
          homepage: 'https://github.com/myfoxit/stept-desktop-electron',
          description: 'Cross-platform screen recording and AI guide generation tool',
        }
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          maintainer: 'MyFoxIT',
          homepage: 'https://github.com/myfoxit/stept-desktop-electron',
          description: 'Cross-platform screen recording and AI guide generation tool',
        }
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        background: './assets/dmg-background.png',
        format: 'ULFO'
      },
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'myfoxit',
          name: 'stept-desktop-electron'
        }
      }
    }
  ]
};