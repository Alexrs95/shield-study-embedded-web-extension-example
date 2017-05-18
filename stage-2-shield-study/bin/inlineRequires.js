#!/usr/bin/env node

//const VERSION = require('./package.json').version;

// load the file

const fs = require("fs");

let content = fs.readFileSync(process.argv[2], "utf8");

let splitters = [
  /require\('(.*)'\)/,
  /require\("(.*)"\)/,
 ];

// catch every require, no recursion.
splitters.forEach((splitter) => {
  debugger;
  content = content.split(splitter).map((part,ii)=>{
    try {
      let resolved = require.resolve(part);
      return fs.readFileSync(resolved, "utf8");
    } catch (e) {
      return part
    }
  }).join('');
})

console.log(content);

