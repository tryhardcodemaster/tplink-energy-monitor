const nodeExternals = require('webpack-node-externals');
const WebpackShellPlugin = require('webpack-shell-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

const { NODE_ENV = 'production' } = process.env;

const isDevelopment = NODE_ENV === 'development';

module.exports = {
  name: 'server',
  target: 'node',
  entry: {
    server: './src/server/app.ts',
  },
  mode: NODE_ENV,
  watch: isDevelopment,
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'app.js',
  },
  node: {
    // Need this when working with express, otherwise the build fails
    __dirname: false, // if you don't put this is, __dirname
    __filename: false, // and __filename return blank or /
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.join(__dirname, './src/server/tsconfig.json'),
              transpileOnly: true,
            },
          },
        ],
        exclude: [/node_modules/],
      },
    ],
  },
  externals: [nodeExternals()],
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/server/views', to: 'views' },
        { from: 'src/server/styles', to: 'public' },
      ],
    }),
  ].concat(
    isDevelopment
      ? [
          new WebpackShellPlugin({
            onBuildEnd: ['yarn run:dev'],
          }),
        ]
      : [],
  ),
};
