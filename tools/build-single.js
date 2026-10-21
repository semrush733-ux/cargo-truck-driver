// Builds dist/cargo-truck-driver.html — one self-contained file (CSS + JS inlined) for easy sharing/hosting.
// Usage: node tools/build-single.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'www');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (m, href) =>
  '<style>\n' + fs.readFileSync(path.join(root, href), 'utf8') + '\n</style>');
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');
const icon = fs.readFileSync(path.join(root, 'assets/icon-192.png')).toString('base64');
html = html.replace('</title>', '</title>\n<link rel="icon" href="data:image/png;base64,' + icon + '">');
let first = true;
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, src) => {
  const pre = first ? '<script>window.CT_NO_SW = true;</script>\n' : '';
  first = false;
  return pre + '<script>\n' + fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script>/g, '<\\/script>') + '\n</script>';
});
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
const out = path.join(__dirname, '..', 'dist', 'cargo-truck-driver.html');
fs.writeFileSync(out, html);
console.log('Wrote', out, (html.length / 1024).toFixed(1) + ' KB');
