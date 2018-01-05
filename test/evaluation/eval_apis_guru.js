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

  // print overall numbers:
  let noWarnings = results.successes.filter(s => s.report.warnings.length === 0).length
  console.log(`-------------------\n` +
    `Overall: ${results.overall}\n` +
    `No warnings: ${noWarnings}\n` +
    `Successes: ${results.successes.length}\n` +
    `Errors: ${results.errors.length}`)

  // print breakdown of warnings:
  console.log(`-------------------`)
  let allWarnings = []
  results.successes.forEach(suc => {
    allWarnings = allWarnings.concat(suc.report.warnings)
  })
  let warningDict = groupBy(allWarnings, 'type')
  for (let key in warningDict) {
    warningDict[key] = warningDict[key].length
  }
  console.log(JSON.stringify(warningDict, null, 2))
  console.log(JSON.stringify(classifyErrors(results.errors), null, 2))
}

function classifyErrors (errors) {
  let results = {
    validation: 0,             // thrown by: Swagger2Openapi
    invalidEnumValue: 0,       // thrown by: GraphQL
    invalidFields: 0,          // thrown by: GraphQL
    duplicateNamesInSchema: 0, // thrown by: GraphQL
    cannotBeautify: 0,         // thrown by: OASGraph
    resolveAllOf: 0,           // thrown by: OASGraph
    itemsPropertyMissing: 0,   // thrown by: OASGraph
    invalidReference: 0,       // thrown by: OASGraph
    other: 0
  }
  errors.forEach(err => {
    if (/can not be used as an Enum value/.test(err.error)) {
      results.invalidEnumValue++
    } else if (/^Cannot beautify /.test(err.error)) {
      results.cannotBeautify++
    } else if (/allOf will overwrite/.test(err.error)) {
      results.resolveAllOf++
    } else if (/(Patchable)/.test(err.error)) {
      results.validation++
    } else if (/Items property missing in array/.test(err.error)) {
      results.itemsPropertyMissing++
    } else if (/Schema must contain unique named types/.test(err.error)) {
      results.duplicateNamesInSchema++
    } else if (/must be an object with field names as keys/.test(err.error)) {
      results.invalidFields++
    } else if (/Could not resolve reference/.test(err.error)) {
      results.invalidReference++
    } else {
      results.other++
    }
  })
  return results
}

/**
 * Helper util to group objects in an array based on a given property.
 *
 * @param  {Array} list
 * @param  {String} prop Name of property to group by
 * @return {Object}
 */
function groupBy (list, prop) {
  var groups = {}
  list.forEach(function (item) {
    var list = groups[item[prop]]

    if (list) {
      list.push(item)
    } else {
      groups[item[prop]] = [item]
    }
  })
  return groups
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
