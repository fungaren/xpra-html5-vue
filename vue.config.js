const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  productionSourceMap: false,
  transpileDependencies: true,
  // Use relative path for static resources
  publicPath: 'auto',
  pages: {
    index: {
      entry: 'src/main.js',
      template: 'public/index.html',
      filename: 'index.html',
      title: 'Xpra-html5-vue',
      chunks: ['chunk-vendors', 'chunk-common', 'index']
    },
  },
  // filenameHashing: false,
  configureWebpack: {
    resolve: {
      // https://webpack.js.org/configuration/resolve/#resolvefallback
      fallback: {
        // "path": require.resolve("path-browserify"),
        // "util": require.resolve("util/"),
        // "assert": require.resolve("assert/"),
        "stream": require.resolve("stream-browserify"),
        "crypto": require.resolve("crypto-browserify"),
        "zlib": require.resolve("browserify-zlib"),
        "fs": false,
      },
    },
    optimization: {
      splitChunks: {
        chunks: 'async',
        cacheGroups: {
          defaultVendors: {},
        },
      },
    },
  },
  devServer: {
    liveReload: false, // Avoid auto refresh
    hot: false, // Disable Hot Module Replacement
    host: '0.0.0.0',
    port: 8899,
    proxy: {
      '/xpra-ws': {
        target: 'http://127.0.0.1:10000/',
        changeOrigin: true,
        ws: true,
      },
    }
  },
})
