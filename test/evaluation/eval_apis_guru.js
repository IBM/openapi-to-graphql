// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

const OasGraph = require('../../lib/index.js')
const Glob = require('glob')
const fs = require('fs')
const YAML = require('js-yaml')
const ss = require('simple-statistics')

/**
 * Download all OAS from APIs.guru.
 *
 * @return {Promise} Resolves on array of OAS
 */
async function readOas (limit) {
  let OASList = []
  let paths = Glob.sync('tmp/**/@(*.yaml|*.json)')
  let index = -1

  while (OASList.length < limit && index < paths.length) {
    index++
    let path = paths[index]
    let oas = readFile(path)
    if (!oas) continue
    if (!isValidOAS(oas)) continue

    // keep track of path for later logging:
    oas['x-file-path'] = path

    OASList.push(oas)
  }

  return OASList
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
    console.log(`Process "${name}" (${oas['x-file-path']})...`)
    try {
      let {report} = await OasGraph.createGraphQlSchema(oas, {
        strict: false,
        addSubOperations: false
      })
      results.successes.push({name, report})
    } catch (error) {
      results.errors.push({name, error: error.message, path: oas['x-file-path']})
    }
  }
  // console.log(JSON.stringify(results, null, 2))

  // print results:
  printOverallResults(results)
  printWarningsBreakdown(results)
  // printErrorBreakdown(results)
  // printStats(results)
  // console.log(JSON.stringify(getWarningsDistribution(results), null, 2))
  // console.log(JSON.stringify(warningsPerApi(results), null, 2))
}

function printOverallResults (results) {
  let noWarnings = results.successes.filter(s => s.report.warnings.length === 0).length
  console.log('----------------------')
  console.log('Overall results:')
  console.log(`Assessed APIs: ${results.overall}\n` +
    `Successes: ${results.successes.length}\n` +
    `  with no warnings: ${noWarnings}\n` +
    `Errors: ${results.errors.length}`)
}

function printWarningsBreakdown (results) {
  let allWarnings = []
  results.successes.forEach(suc => {
    allWarnings = allWarnings.concat(suc.report.warnings)
  })
  let warningDict = groupBy(allWarnings, 'type')
  for (let key in warningDict) {
    warningDict[key] = warningDict[key].length
  }
  console.log('----------------------')
  console.log('Warnings breakdown:')
  console.log(JSON.stringify(warningDict, null, 2))
}

function printErrorBreakdown (results) {
  let errors = {
    validationFails: 0,        // thrown by: Swagger2Openapi
    invalidEnumValue: 0,       // thrown by: GraphQL
    invalidFields: 0,          // thrown by: GraphQL
    duplicateNamesInSchema: 0, // thrown by: GraphQL
    cannotBeautify: 0,         // thrown by: OASGraph
    resolveAllOf: 0,           // thrown by: OASGraph
    itemsPropertyMissing: 0,   // thrown by: OASGraph
    invalidReference: 0,       // thrown by: OASGraph
    other: 0
  }
  results.errors.forEach(err => {
    if (/can not be used as an Enum value/.test(err.error)) {
      errors.invalidEnumValue++
    } else if (/^Cannot beautify /.test(err.error)) {
      errors.cannotBeautify++
    } else if (/allOf will overwrite/.test(err.error)) {
      errors.resolveAllOf++
    } else if (/(Patchable)/.test(err.error)) {
      errors.validationFails++
    } else if (/Items property missing in array/.test(err.error)) {
      errors.itemsPropertyMissing++
    } else if (/Schema must contain unique named types/.test(err.error)) {
      errors.duplicateNamesInSchema++
    } else if (/must be an object with field names as keys/.test(err.error)) {
      errors.invalidFields++
    } else if (/Could not resolve reference/.test(err.error)) {
      errors.invalidReference++
    } else {
      errors.other++
    }
  })

  console.log('----------------------')
  console.log('Errors breakdown:')
  console.log(JSON.stringify(errors, null, 2))
}

function getWarningsDistribution (results) {
  let dist = {
    overall: {},
    MissingResponseSchema: {},
    InvalidSchemaType: {},
    MultipleResponses: {},
    InvalidSchemaTypeScalar: {}
  }

  results.successes.forEach(suc => {
    let overall = suc.report.warnings.length
    if (typeof dist.overall[overall] === 'undefined') dist.overall[overall] = 0
    dist.overall[overall]++

    let missingResponseSchema = suc.report.warnings.filter(w => w.type === 'MissingResponseSchema').length
    if (typeof dist.MissingResponseSchema[missingResponseSchema] === 'undefined') dist.MissingResponseSchema[missingResponseSchema] = 0
    dist.MissingResponseSchema[missingResponseSchema]++

    let invalidSchemaType = suc.report.warnings.filter(w => w.type === 'InvalidSchemaType').length
    if (typeof dist.InvalidSchemaType[invalidSchemaType] === 'undefined') dist.InvalidSchemaType[invalidSchemaType] = 0
    dist.InvalidSchemaType[invalidSchemaType]++

    let multipleResponses = suc.report.warnings.filter(w => w.type === 'MultipleResponses').length
    if (typeof dist.MultipleResponses[multipleResponses] === 'undefined') dist.MultipleResponses[multipleResponses] = 0
    dist.MultipleResponses[multipleResponses]++

    let invalidSchemaTypeScalar = suc.report.warnings.filter(w => w.type === 'InvalidSchemaTypeScalar').length
    if (typeof dist.InvalidSchemaTypeScalar[invalidSchemaTypeScalar] === 'undefined') dist.InvalidSchemaTypeScalar[invalidSchemaTypeScalar] = 0
    dist.InvalidSchemaTypeScalar[invalidSchemaTypeScalar]++
  })

  // fill up empty values for easier plotting:
  for (let i = 0; i < 550; i++) {
    if (typeof dist.overall[i] === 'undefined') dist.overall[i] = 0
    if (typeof dist.MissingResponseSchema[i] === 'undefined') dist.MissingResponseSchema[i] = 0
    if (typeof dist.InvalidSchemaType[i] === 'undefined') dist.InvalidSchemaType[i] = 0
    if (typeof dist.MultipleResponses[i] === 'undefined') dist.MultipleResponses[i] = 0
    if (typeof dist.InvalidSchemaTypeScalar[i] === 'undefined') dist.InvalidSchemaTypeScalar[i] = 0
  }

  return dist
}

function printStats (results) {
  let numOps = results.successes.map(succ => succ.report.numOps)
  console.log(`Number of operations:`)
  console.log(printSummary(numOps) + '\n')

  let numOpsQuery = results.successes.map(succ => succ.report.numOpsQuery)
  console.log(`Number of query operations:`)
  console.log(printSummary(numOpsQuery) + '\n')

  let numOpsMutation = results.successes.map(succ => succ.report.numOpsMutation)
  console.log(`Number of mutation operations:`)
  console.log(printSummary(numOpsMutation) + '\n')

  let numQueries = results.successes.map(succ => succ.report.numQueriesCreated)
  console.log(`Number of queries created:`)
  console.log(printSummary(numQueries) + '\n')

  let numMutations = results.successes.map(succ => succ.report.numMutationsCreated)
  console.log(`Number of mutations created:`)
  console.log(printSummary(numMutations) + '\n')

  let numQueriesSkipped = []
  numOpsQuery.forEach((numOps, index) => {
    numQueriesSkipped.push(numOps - numQueries[index])
  })
  console.log(`Number of queries skipped:`)
  console.log(printSummary(numQueriesSkipped) + '\n')

  let numMutationsSkipped = []
  numOpsMutation.forEach((numOps, index) => {
    numMutationsSkipped.push(numOps - numMutations[index])
  })
  console.log(`Number of mutations skipped:`)
  console.log(printSummary(numMutationsSkipped) + '\n')
}

function printSummary (arr) {
  console.log(`mean: ${ss.mean(arr)}`)
  console.log(`min:  ${ss.min(arr)}`)
  console.log(`max:  ${ss.max(arr)}`)
  console.log(`---`)
  console.log(`25%:  ${ss.quantile(arr, 0.25)}`)
  console.log(`50%:  ${ss.quantile(arr, 0.50)}`)
  console.log(`75%:  ${ss.quantile(arr, 0.75)}`)
  console.log(`90%:  ${ss.quantile(arr, 0.9)}`)
}

function warningsPerApi (results) {
  let apiDict = {}
  results.successes.forEach(suc => {
    let name = suc.name
    while (typeof apiDict[name] !== 'undefined') {
      name += '_1'
    }
    apiDict[name] = {
      overall: suc.report.warnings.length,
      MissingResponseSchema: suc.report.warnings.filter(w => w.type === 'MissingResponseSchema').length,
      InvalidSchemaType: suc.report.warnings.filter(w => w.type === 'InvalidSchemaType').length,
      MultipleResponses: suc.report.warnings.filter(w => w.type === 'MultipleResponses').length,
      InvalidSchemaTypeScalar: suc.report.warnings.filter(w => w.type === 'InvalidSchemaTypeScalar').length,
      numOps: suc.report.numOps,
      numOpsCreated: suc.report.numQueriesCreated + suc.report.numMutationsCreated
    }
  })
  return apiDict
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
