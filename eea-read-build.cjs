const fs = require('fs');
const path = require('path');
const p = path.join(process.env.TEMP, 'b.txt');
const f = fs.readFileSync(p, 'utf8').split('\n').filter(s => /Completed|error|Error|failed/.test(s)).slice(0,3);
console.log(f.join('\n'));