const fs = require("fs");
const { resolve } = require('path');
const postHTML = require("posthtml");
const posthtmlInlineAssets = require("posthtml-inline-assets");
const root = require('app-root-path').resolve('/');
const package = require(
  require('app-root-path').resolve('/package.json')
);

if (package.inliner && package.inliner.verbose) {
  console.log('INLINER:', {root, settings: package.inliner});
}

module.exports = bundler => {
  if (!package.inliner) return;
  const verbose = package.inliner.verbose;

  if (verbose) {
    console.log(`INLINER: Paths to inline\n${package.inliner.paths.map(p => `${resolve(root, p)}, ${p}`).join('\n')}`);
  }

  if (Array.isArray(package.inliner.paths)) {
    bundler.on("bundled", (bundle) => {
      const bundles = Array.from(bundle.childBundles).concat([bundle]);

      return Promise.all(bundles.map(async bundle => {
        if (!bundle.entryAsset || bundle.entryAsset.type !== "html") {
          if (verbose) console.log(`INLINER: Skipping non-html asset.`);
          return;
        }

        if (verbose) console.log(`INLINER: Checking paths for ${bundle.name}`);
        const shouldInline = Boolean(package.inliner.paths.find(path => resolve(root, path) === bundle.name || path === bundle.name));

        if (!shouldInline) {
          if (verbose) console.log('INLINER: No path in settings found.');
          return;
        }

        if (verbose) console.log('INLINER: Path found, performing inlining!');
        const cwd = bundle.entryAsset.options.outDir;
        const data = fs.readFileSync(bundle.name);

        const result = await postHTML([
          posthtmlInlineAssets({
            cwd,
            transforms: {
              linkScss: {
                resolve(node) {
                  console.log(
                    cwd,
                    node.tag, node.attrs && node.attrs.href,
                    node.tag === 'link' && node.attrs && node.attrs.href && node.attrs.href.indexOf('css') === node.attrs.href.length - 3 && node.attrs.href.indexOf('http') < 0
                  );

                  // Convert links to styles
                  const isLink = node.tag === 'link' &&
                    node.attrs &&
                    node.attrs.href &&
                    node.attrs.href.indexOf('css') === node.attrs.href.length - 3 &&
                    node.attrs.href.indexOf('http') < 0
                  ;

                  if (isLink) {
                    node.attrs.href = resolve(cwd, node.attrs.href);
                    return node.attrs.href;
                  }

                  // After a link is converted to a style it is recycled in a way that does not affect the style but
                  // retains the source scss link.
                  const isStyle = node.tag === 'style' &&
                    node.attrs &&
                    node.attrs['data-link'] &&
                    node.attrs['data-link'].indexOf('css') === node.attrs['data-link'].length - 3 &&
                    node.attrs['data-link'].indexOf('http') < 0
                  ;

                  if (isStyle) {
                    return node.attrs['data-link'];
                  }

                  return undefined;
                },
                transform(node, data) {
                  console.log('TRANSFORMING', node.attrs.href);
                  node.tag = 'style';
                  node.attrs['data-link'] = node.attrs.href || node.attrs['data-link'];
                  delete node.attrs.href;
                  delete node.attrs.type;
                  node.content = data.buffer.toString('utf8');
                }
              }
            }
          })
        ]).process(data);

        fs.writeFileSync(bundle.name, result.html);
      }));
    });
  }
};
