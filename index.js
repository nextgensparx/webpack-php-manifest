var _ = require('lodash')
var path = require('path')
var url = require('url')
var fs = require('fs')

function PhpManifestPlugin (options) {
  this.options = options || {}
}

const optionOrFallback = (optionValue, fallbackValue) => optionValue !== undefined ? optionValue : fallbackValue;

const withPrefix = (prefix) => (ext) => (assets, filepath) =>
  Object.keys(assets)
    .reduce((acc, name) => {
      let chunk = ((_.isArray(assets[name])) ? assets[name] : [assets[name]])
        .filter(function (filename) {
          return filename.endsWith(ext);
        })
        .reduce(function (_, filename) {
          return (!prefix)
            ? path.join(filepath, filename)
            : url.resolve(prefix, path.join(filepath, filename));
        }, undefined);

      if (chunk) {
        acc[name] = chunk;
      }

      return acc;
    }, {});

PhpManifestPlugin.prototype.apply = function apply (compiler) {
  var options = this.options;
  // Get webpack options
  var filepath = options.path ? options.path : '';
  // Public path (like www), used when writing the file
  var prefix = options.pathPrefix ? options.pathPrefix : '';
  // By default, build the file with node fs. Can be included in webpack with an option.
  var output = optionOrFallback(options.output, 'assets-manifest') + '.php';

  var phpClassName = optionOrFallback(options.phpClassName, 'WebpackBuiltFiles');

  var withExtension = withPrefix(prefix);
  var getCssFiles = withExtension('.css');
  var getJsFiles = function (assets, filepath) {
    var files = withExtension('.js')(assets, filepath);

    // Add webpack-dev-server js url
    if (options.devServer) {
      files['webpack-dev-server'] = url.resolve(prefix, 'webpack-dev-server.js');
    }

    return files;
  }

  var arrayToPhpStatic = function(list, varname) {
    var out = '\n  static $' + varname + ' = ['
    _.forEach(list, function (item, name) {
      out += "\n    '" + name + "' => '" + item + "',";
    });
    out += '\n  ];';
    return out;
  };

  var phpClassComment = function(phpClassName) {
    return '/** \n* Built by webpack-php-manifest \n* Class ' + phpClassName + '\n*/\n';
  }

  var objectToPhpClass = function(phpClassName, obj) {
    // Create a header string for the generated file:
    var out = '<?php\n'
      + phpClassComment(phpClassName)
      + 'class ' + phpClassName + ' {';

    _.forEach(obj, function (list, name) {
      out += arrayToPhpStatic(list, name);
    });

    out += '\n}\n';
    return out;
  };

  var mkOutputDir = function(dir) {
    // Make webpack output directory if it doesn't already exist
    try {
      fs.mkdirSync(dir);
    } catch (err) {
      // If it does exist, don't worry unless there's another error
      if (err.code !== 'EEXIST') throw err;
    }
  }

  compiler.plugin('emit', function(compilation, callback) {

    var stats = compilation.getStats().toJson();

    var out = objectToPhpClass(phpClassName, {
      jsFiles: getJsFiles(stats.assetsByChunkName, filepath),
      cssFiles: getCssFiles(stats.assetsByChunkName, filepath),
    });

    // Write file using fs
    // Build directory if it doesn't exist
    mkOutputDir(path.resolve(compiler.options.output.path));
    fs.writeFileSync(path.join(compiler.options.output.path, output), out);

    callback();
  });
};

module.exports = PhpManifestPlugin;
