/**
 * Created by zhiyuan.huang@ddder.net.
 */

export default function exposeToGlobal(content) {
  this.cacheable();
  return `
${content}
(function() {
  for (let key in module.exports) {
    if (module.exports.hasOwnProperty(key)) global[key] = module.exports[key];
  }
})();
`;
}
