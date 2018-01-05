'use strict'

const OasGraph = require('../../lib/index.js')
const Glob = require('glob')
const fs = require('fs')
const YAML = require('js-yaml')

/**
 * Download all OAS from APIs.guru.
 *
 * @return {Promise} Resolves on array of OAS
 */
async function readOas (limit) {
  let OASList = []
  let paths = Glob.sync('tmp/**/@(*.yaml|*.json)')
  paths.forEach(path => {
    let oas = readFile(path)
    if (!oas) return
    if (!isValidOAS(oas)) return

    // keep track of path for later logging:
    oas['x-file-path'] = path

    OASList.push(oas)
  })
  return OASList.slice(0, limit)
}

/**
 * Attempts to build schema for every OAS in given list.
 */
async function checkOas (OASList) {
  let results = {
    overall: OASList.length,
    successes: [],
    errors: []
  }
  for (let oas of OASList) {
    let name = oas.info.title
    console.log(`Process "${name}"...`)
    console.log(` (${oas['x-file-path']})\n`)
    try {
      let {report} = await OasGraph.createGraphQlSchema(oas, {strict: false})
      results.successes.push({name, report})
    } catch (error) {
      results.errors.push({name, error: error.message})
    }
  }
  console.log(JSON.stringify(results, null, 2))
  let noWarnings = results.successes.filter(s => s.report.warnings.length === 0).length
  console.log(`-------------------\n` +
    `Overall: ${results.overall}\n` +
    `No warnings: ${noWarnings}\n` +
    `Successes: ${results.successes.length}\n` +
    `Errors: ${results.errors.length}`)
}

/**
 * Returns content of read JSON/YAML file.
 *
 * @param  {String} path Path to file to read
 * @return {Object}      Content of read file
 */
function readFile (path) {
  try {
    let doc
    if (/json$/.test(path)) {
      doc = JSON.parse(fs.readFileSync(path, 'utf8'))
    } else if (/yaml$|yml$/.test(path)) {
      doc = YAML.safeLoad(fs.readFileSync(path, 'utf8'))
    }
    return doc
  } catch (e) {
    console.error('Error: failed to parse YAML/JSON: ' + e)
    return null
  }
}

/**
 * Basic checks to make sure we are dealing with a vaild Swagger / OAS 2.0
 *
 * @param  {Object}  oas
 * @return {Boolean}
 */
const isValidOAS = (oas) => {
  return typeof oas === 'object' &&
    typeof oas.info === 'object' &&
    typeof oas.info.title === 'string' &&
    typeof oas.info.description === 'string' &&
    typeof oas.swagger === 'string' &&
    oas.swagger === '2.0'
}

// determine maximum number of OAS to test:
let limit = 0
try {
  limit = Number(process.argv[2])
  if (isNaN(limit)) throw new Error(`Not a number`)
} catch (e) {
  console.error(`Error: Please provide maximum number of APIs to check. ` +
    `For example:\n\n     npm run guru-test 10\n`)
  process.exit()
}

// go go go:
readOas(limit)
  .then(checkOas)
  .catch(console.error)
