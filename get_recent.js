const fs = require('fs');
const path = require('path');

function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('.git')) {
        getFiles(fullPath, files);
      }
    } else {
      files.push({ path: fullPath, mtime: stat.mtime });
    }
  }
  return files;
}

const allFiles = getFiles('C:\\Users\\Silva\\WORKSPACE\\CLIs\\_cowork_os_pack');
allFiles.sort((a, b) => b.mtime - a.mtime);
const top = allFiles.slice(0, 30);
top.forEach(f => console.log(f.mtime.toISOString(), f.path));
