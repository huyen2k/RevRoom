const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'dist');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css' };
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end(); return;
  }
  res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
server.listen(0,'127.0.0.1',() => {
  const url = 'http://127.0.0.1:' + server.address().port;
  console.log('Mo web tai ' + url + ' | Ctrl+C de dung.');
  if (process.platform === 'win32') require('node:child_process').spawn('explorer.exe',[url]).on('error',()=>{});
});
