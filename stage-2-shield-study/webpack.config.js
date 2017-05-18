var path = require('path');
var WrapperPlugin = require('wrapper-webpack-plugin');

module.exports = {
    entry: './src/ShieldStudy.jsm',
    output: {
        path: path.resolve(__dirname, 'addon/lib'),
        filename: 'ShieldStudy.jsm',
        //library: 'BLAH',
        //libraryTarget: 'this' // Possible value - amd, commonjs, commonjs2, commonjs-module, this, var
    },
  plugins: [
    // strict mode for the whole bundle
    new WrapperPlugin({
      header: 'EXPORTED_SYMBOLS=["shieldUtils"];\n'
      //footer: '\n})();'
    })
  ]
};
