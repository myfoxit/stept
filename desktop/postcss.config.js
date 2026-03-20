const path = require('path');

module.exports = {
  plugins: [
    require(path.join(__dirname, 'node_modules', 'tailwindcss')),
    require(path.join(__dirname, 'node_modules', 'autoprefixer')),
  ],
};
