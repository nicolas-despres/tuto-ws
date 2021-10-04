#!/usr/bin/env node
var process = require('process');
var child_process = require('child_process');
var { env } = require("./env.js")

const command = process.argv[2]
var myArgs = process.argv.slice(3);
if (process.env.ENV != 'production') {
  myArgs.push(`/DEMO:TRUE`)
}

if (command == 'eWAMService.exe') {
  if (!process.env.PORT)
    console.log("env var 'PORT' is not defined. Taking 9944 as default")
  myArgs.push(`/RUNASSERVICE.PORT:${process.env.PORT || 9944}`)
}

if (command == "ewam.exe") {
  console.log(myArgs)
}

console.log(`\x1b[33m> Run '${command} ${myArgs && myArgs.join(" ")}'\x1b[0m`)
child_process.spawn(
  command,
  myArgs,
  {
    env,
    stdio: [process.stdin, process.stdout, process.stderr],
  }
)


