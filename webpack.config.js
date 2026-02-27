const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    target: 'electron-renderer',
    entry: {
      spotlight: './src/renderer/spotlight-entry.tsx',
      settings: './src/renderer/settings-entry.tsx',
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/i,
          use: [
            'style-loader',
            'css-loader',
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  plugins: [
                    require('tailwindcss'),
                    require('autoprefixer'),
                  ],
                },
              },
            },
          ],
        },
        {
          test: /\.(png|jpe?g|gif|svg)$/i,
          type: 'asset/resource',
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@renderer': path.resolve(__dirname, 'src/renderer'),
        '@main': path.resolve(__dirname, 'src/main'),
      },
    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'lib/renderer'),
      clean: true,
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/renderer/spotlight.html',
        filename: 'spotlight.html',
        chunks: ['spotlight'],
      }),
      new HtmlWebpackPlugin({
        template: './src/renderer/settings.html',
        filename: 'settings.html',
        chunks: ['settings'],
      }),
    ],
    devServer: {
      static: {
        directory: path.join(__dirname, 'lib/renderer'),
      },
      port: 8080,
      hot: true,
      historyApiFallback: true,
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    externals: {
      electron: 'commonjs electron',
    },
  };
};
