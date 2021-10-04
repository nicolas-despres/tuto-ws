var Process = require("process")
const Path = require("path")
const fs = require("fs")
var express = require("express")
var cookieParser = require("cookie-parser")
var { env } = require("./scripts/env.js")
var { directory } = require("@polycuber/script.cli")
var cors = require('cors')

require("process").on('uncaughtException', (e) => {
  console.error(e)
})

Object.assign(Process.env, env)

//Add Win32 Dlls (required for docker)
Process.env.PATH = `${Process.env.PATH};${__dirname}/node_modules/@ewam/win32dll/bin`

require("@ewam/kernel")
require("@ewam/library")

if (process.env.NODE_ENV == "production" && fs.existsSync(__dirname + "/CppDll")) {
  Process.env.PATH = `${Process.env.PATH};${__dirname}/CppDll`
  Process.env["WYDE-DLL"] = `${Process.env["WYDE-DLL"]};${__dirname}/CppDll`
  console.log("The server will run with compiled CPP Dlls", Process.env["WYDE-DLL"])
}

var ewam = require("@ewam/node-hosting")
const clickonce = require("@ewam/clickonce")

const myArgs = []
if (!process.env.PORT) {
  console.log("env var 'PORT' is not defined. Taking 8080 as default")
}
const PORT = process.env.PORT || 8080
const ADMIN_PORT = process.env.ADMIN_PORT || 8081
myArgs.push(`/RUNASSERVICE.PORT:${PORT}`)

const app = express()
//app.use(cors())
const adminApp = express()
adminApp.use(cors())

if (!process.env.NODE_ENV != 'production') {
  console.warn("Running in development")
  myArgs.push(`/DEMO:TRUE`)
}

const additionalArgs = Object.keys(process.env)
  .filter(key => key.startsWith("EWAM_ARG_"))
  .map(key => {
    return `/${key.slice("EWAM_ARG_".length)}:${process.env[key]}`
  })
myArgs.push(...additionalArgs)

myArgs.push(`@(WYDE-ADMIN)/Appli.cfg`)

app.use(cookieParser())

ewam.connect({
  ...JSON.parse(fs.readFileSync(Path.join(Process.env["WYDE-ADMIN"], "config-runtime.json"))),
  arguments: ["@(WYDE-ADMIN)/required-parameters.cfg", ...myArgs]
})

ewam.on([
  "runtime.session.startup",
  "runtime.session.exit",
], (message, type) => {
  console.log(`session event '${type}' :`, message)
})

ewam.on("runtime.error", (message) => {
  console.log("error", message)
})

const bodyParser = function (req, res, next) {

  let reqBody = [];
  req.on("data", chunk => {
    reqBody.push(chunk);
  })

  req.on("end", (chunk) => {
    if (chunk)
      reqBody.push(chunk);
    reqBody = Buffer.concat(reqBody).slice(48).toString('utf8');
    console.log("request", reqBody)
  })

  res.write = function (chunk) {
    chunks.push(chunk);
    return oldWrite.apply(res, arguments);
  }

  var oldEnd = res.end
  var oldWrite = res.write
  var chunks = [];

  res.end = function (chunk) {
    if (chunk)
      chunks.push(chunk);

    var resBody = Buffer.concat(chunks).toString('utf8')
    console.log("response", resBody)
    oldEnd.apply(res, arguments)
  }
  next()
}

//app.use(bodyParser)

const administrator = ewam.getAdministrator()

if (process.env.WAM_SERVICE) {
  const router = ewam.getApplication(process.env.WAM_SERVICE)
  if (!router) throw (`Cannot find ${process.env.WAM_SERVICE} in your configuration`)
  app.use(`/`, router.dispatchHttpRequest.bind(router))
} else {
  for (const route of ewam.getApplicationConfigurationNames()) {
    const router = ewam.getApplication(route)
    app.use(`/${route}`, router.dispatchHttpRequest.bind(router))
  }
}

if (!process.env.WAM_SERVICE) {
  /*   example of a config of clickonce deployment.
     Commented below because it must be done on the web tier
     You can see a working example by installing the web tier
  */
  let clickOnceRouter = express.Router()

  clickOnceRouter.use(express.static(clickonce.PublicPath))
  clickOnceRouter.get("/ClickOnceApplication.js", (req, res) => {
    // 'ClickOnceApplication.js' is the variable part of the website
    // > it depends of the location of wydeweb service
    res.status(200)
      .set('Content-Type', 'text/javascript')
      .send(clickonce.generateClickOnceApplicationJs(req.protocol + '://' + req.get('host') + '/sampleAppli'));
  })
  app.use("/ClickOnce", clickOnceRouter)
}

const server = app.listen(PORT, function () {
  const port = server.address().port
  console.log("Process " + process.pid + " is listening on " + port)
  process.send && process.send('server-started')
})

// ********
// Admin server on Port ADMIN_PORT
// ********

// Admin shall not be exposed in production
adminApp.use("/admin", administrator.dispatchHttpRequest.bind(administrator))

adminApp.get('/healthz', (req, res) => {
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send("Alive")
})

const adminServer = adminApp.listen(ADMIN_PORT, function () {
  const port = adminServer.address().port
  console.log("Admin Process " + process.pid + " is listening on " + port)
})