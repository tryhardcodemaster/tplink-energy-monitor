const path = require('path');
const webpack = require('webpack');

const {
    NODE_ENV = 'production',
} = process.env;

module.exports = {
    name: 'client',
    target: 'web',
    entry: path.join(__dirname, './src/client/dash.ts'),
    mode: NODE_ENV,
    watch: NODE_ENV === 'development',
    output: {
        path: path.resolve(__dirname, 'build/public/'),
        filename: 'bundle.js'
    },
    node: {
        // Need this when working with express, otherwise the build fails
        __dirname: false,   // if you don't put this is, __dirname
        __filename: false,  // and __filename return blank or /
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [{
                    loader: 'ts-loader',
                    options: {
                        configFile: path.join(__dirname, './src/client/tsconfig.json')
                    }
                }],
                exclude: [
                    /node_modules/
                ]
            },
            {
                test: /\.css$/,
                use: [ 'style-loader', 'css-loader' ]
            },
        ]
    },
    plugins: [
        new webpack.ProvidePlugin({
            $: 'jquery',
            jQuery: 'jquery'
        })
    ]
};
