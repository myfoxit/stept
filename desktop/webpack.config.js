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
          use: {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'tsconfig.json'),
              transpileOnly: true,
            },
          },
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
                  config: path.resolve(__dirname, 'postcss.config.js'),
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
      modules: [path.resolve(__dirname, 'node_modules'), 'node_modules'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@renderer': path.resolve(__dirname, 'src/renderer'),
        '@main': path.resolve(__dirname, 'src/main'),
        'react': path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
        '@types/react': path.resolve(__dirname, 'node_modules/@types/react'),
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
    // Use non-eval source maps — eval-based maps are blocked by CSP (script-src 'self')
    devtool: isProduction ? 'source-map' : 'cheap-module-source-map',
    externals: {
      electron: 'commonjs electron',
    },
  };
};
