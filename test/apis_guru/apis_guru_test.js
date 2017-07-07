'use strict'

const OasGraph = require('../../index.js')
const Glob = require('glob')
const fs = require('fs')
const YAML = require('js-yaml')

let limit = 0

/**
 * Download all OAS from APIs.guru.
 *
 * @return {Promise} Resolves on array of OAS
 */
const loadOas = () => {
  return new Promise((resolve, reject) => {
    let OASList = []
    let paths = Glob.sync('tmp/**/@(*.yaml|*.json)')
    paths.forEach(path => {
      let oas = loadFile(path)
      if (!oas) return
      if (!isValidOAS(oas)) return

      // keep track of path for later logging:
      oas['x-file-path'] = path

      OASList.push(oas)
    })
    resolve(OASList.slice(0, limit))
  })
}

/**
 * Attempts to build schema for every OAS in given list.
 */
const checkOas = (OASList) => {
  let results = {
    successes: 0,
    errors: 0,
    errorAPIs: []
  };
  (async () => {
    for (let oas of OASList) {
      console.log(`\n\nProcess "${oas.info.title}"...`)
      console.log(` (${oas['x-file-path']})\n`)
      await OasGraph.createGraphQlSchema(oas)
        .then(schema => {
          console.log(`O.k.`)
          results.successes++
        })
        .catch(e => {
          console.error(e)
          results.errorAPIs.push(`${oas.info.title} (${oas['x-file-path']})`)
          results.errors++
        })
    }

    // print results:
    console.log(`Failed APIs:`)
    console.log(JSON.stringify(results.errorAPIs, null, 2))
    console.log(`Successes: ${results.successes}`)
    console.log(`Errors:    ${results.errors}`)
  })()
}

/**
 * Helpers
 */
const loadFile = (path) => {
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

const isValidOAS = (oas) => {
  return typeof oas === 'object' &&
    typeof oas.info === 'object' &&
    typeof oas.info.title === 'string' &&
    typeof oas.info.description === 'string' &&
    typeof oas.swagger === 'string' &&
    oas.swagger === '2.0'
}

// determine maximum number of OAS to test:
try {
  limit = Number(process.argv[2])
  if (isNaN(limit)) throw new Error(`Not a number`)
} catch (e) {
  console.error(`Error: Please provide maximum number of APIs to check. ` +
    `For example:\n\n     npm run guru-test 10\n`)
  process.exit()
}

// go go go:
loadOas()
  .then(checkOas)
  .catch(console.error)
