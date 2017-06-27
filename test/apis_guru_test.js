'use strict'

const Git = require('nodegit')
const OasGraph = require('../index.js')
const Glob = require('glob')
const rimraf = require('rimraf')
const fs = require('fs')
const YAML = require('js-yaml')

/**
 * Download all OAS from APIs.guru.
 *
 * @return {Promise} Resolves on array of OAS
 */
const downloadOas = () => {
  return new Promise((resolve, reject) => {
    let OASList = []
    Git.Clone(`https://github.com/APIs-guru/openapi-directory`, './tmp')
      .then(repo => {
        return repo.getCurrentBranch()
      })
      .then(branch => {
        let paths = Glob.sync('tmp/**/@(*.yaml|*.json)')
        paths.forEach(path => {
          let oas = loadFile(path)
          if (!oas) return
          if (!isValidOAS(oas)) return

          OASList.push(oas)
        })
        resolve(OASList.slice(0, 5))
        return paths
      })
      .catch(reject)
  })
}

/**
 * Attempts to build schema for every OAS in given list.
 */
const checkOas = (OASList) => {
  (async () => {
    for (let oas of OASList) {
      console.log(`\n\nProcess ${oas.info.title}...\n`)
      await OasGraph.createGraphQlSchema(oas)
        .then(schema => {
          console.log(`  Result: ${schema}`)
        })
        .catch(e => {
          console.error(e)
        })
    }
    emptyTmp()
  })()
}

/**
 * Helpers
 */
const emptyTmp = () => {
  rimraf.sync('tmp')
}

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

// go go go:
downloadOas()
  .then(checkOas)
  .catch(e => {
    console.error(e)
  })
