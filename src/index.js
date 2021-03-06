/* eslint-disable
  import/first,
  import/order,
  comma-dangle,
  linebreak-style,
  no-param-reassign,
  no-underscore-dangle,
  prefer-destructuring
*/
import path from 'path';
import schema from './options.json';
import loaderUtils from 'loader-utils';
import validateOptions from 'schema-utils';

import NodeTargetPlugin from 'webpack/lib/node/NodeTargetPlugin';
import SingleEntryPlugin from 'webpack/lib/SingleEntryPlugin';
import WebWorkerTemplatePlugin from 'webpack/lib/webworker/WebWorkerTemplatePlugin';

import getWorker from './workers/';
import LoaderError from './Error';

export default function loader() {}

export function pitch(request) {
  const options = loaderUtils.getOptions(this) || {};
  const resourcePath = this.resourcePath;

  validateOptions(schema, options, 'Worker Loader');

  if (!this.webpack) {
    throw new LoaderError({
      name: 'Worker Loader',
      message: 'This loader is only usable with webpack'
    });
  }

  this.cacheable(false);

  const cb = this.async();

  const filename = loaderUtils.interpolateName(this, options.name || '[hash].worker.js', {
    context: options.context || this.options.context,
    regExp: options.regExp,
  });

  const worker = {};

  worker.options = {
    filename,
    chunkFilename: `[id].${filename}`,
    namedChunkFilename: null,
  };

  worker.compiler = this._compilation
    .createChildCompiler('worker', worker.options);

  worker.compiler.apply(new WebWorkerTemplatePlugin(worker.options));

  if (this.target !== 'webworker' && this.target !== 'web') {
    worker.compiler.apply(new NodeTargetPlugin());
  }

  worker.compiler.apply(new SingleEntryPlugin(this.context, `!!${request}`, 'main'));

  const subCache = `subcache ${__dirname} ${request}`;

  worker.compiler.plugin('compilation', (compilation) => {
    if (compilation.cache) {
      if (!compilation.cache[subCache]) compilation.cache[subCache] = {};

      compilation.cache = compilation.cache[subCache];
    }

    // in nextly worker mode, we need to expose module.exports to global
    compilation.plugin('build-module', (module) => {
      if (module.request === resourcePath) {
        module.loaders.push({
          loader: path.resolve(__dirname, './global-expose-loader'),
        });
      }
    });
  });

  worker.compiler.runAsChild((err, entries, compilation) => {
    if (err) return cb(err);

    if (entries[0]) {
      worker.file = entries[0].files[0];

      worker.factory = getWorker(
        worker.file,
        compilation.assets[worker.file].source(),
        options
      );

      if (options.fallback === false) {
        delete this._compilation.assets[worker.file];
      }

      const publicPath = options.publicPath ? JSON.stringify(options.publicPath) : '__webpack_public_path__';
      const publicWorkerPath = `${publicPath} + ${JSON.stringify(worker.file)}`;

      return cb(null, `
      module.exports = function(key) {
        if (key) {
          return new Worker(key, ${publicWorkerPath});
        } else {
          return new Worker(${publicWorkerPath});
        }
      };
      `);
    }

    return cb(null, null);
  });
}
