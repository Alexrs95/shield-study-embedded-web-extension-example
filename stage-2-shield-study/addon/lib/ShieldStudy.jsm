"use strict";


const {utils: Cu} = Components;
Cu.import("resource://gre/modules/Log.jsm");
let log = Log.repository.getLogger("shield-study");
log.level = Log.Level.Debug;

Cu.importGlobalProperties(['URL', 'crypto']);
var EXPORTED_SYMBOLS = ["shieldUtils"];

// telemetry utils
const CID = Cu.import('resource://gre/modules/ClientID.jsm');
const { TelemetryController } = Cu.import('resource://gre/modules/TelemetryController.jsm');
const { TelemetryEnvironment } = Cu.import('resource://gre/modules/TelemetryEnvironment.jsm');

async function getTelemetryId() {
  let id = TelemetryController.clientID;
  /* istanbul ignore next */
  if (id === undefined) {
    return await CID.ClientIDImpl._doLoadClientID();
  } else {
    return id;
  }
}

// sampling utils
async function sha256(message) {
    const msgBuffer = new TextEncoder('utf-8').encode(message);                     // encode as UTF-8
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);            // hash the message
    const hashArray = Array.from(new Uint8Array(hashBuffer));                       // convert ArrayBuffer to Array
    const hashHex = hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join(''); // convert bytes to hex string
    return hashHex;
}
function cumsum (arr) {
  return arr.reduce(function(r,c,i){ r.push((r[i-1] || 0) + c); return r }, [] );
}

function chooseFrom(weightedVariations, rng=Math.random()) {
  // no checking that weights and choices are unequal in size.
  var weights = weightedVariations.map(x=>x.weight || 1)
  var choices = weightedVariations.map(x=>x.name)
  let partial = cumsum(weights);
  let total = weights.reduce((a, b) =>  a + b);
  for (let ii=0; ii<choices.length; ii++) {
    if (rng <= partial[ii]/total) {
      return choices[ii];
    }
  }
}

async function hashed(string, salt, bits=12) {
  const hash = await sha256(string+salt);
  return parseInt(hash.substr(0,bits),16)/Math.pow(16,bits)
}

class ShieldStudy {
  constructor (config) {
    this.config = config;
  }
  telemetry (data) {
    log.log("telemetry", data)
  }

  startup () {
    log.debug("starting watchers");
    log.debug("watching duration");
    log.debug("watching telemetry at...");
    return this
  }
  shutdown () {
    return this
  }
  async chooseVariation () {
    return "kitten";
  }
  setVariation (variation) {
    this._variation = variation;
    return this;
  }
  save () {
    log.log("saved to disk!");
    return this
  }
  load () {
    log.log("loaded from disk!");
    return this
  }

  get variation () {
    return this._variation;
  }
}


class Shield {
  constructor () {
    this.config = {}
  }
  configure (config) {
    this.config = config;
    return this
  }
  openTab (tab, vars) {
    log.log("opening this formatted tab")
  }
  die (reason) {
    log.log('dying!', reason)
  }
  async getTelemetryId () {
    return await getTelemetryId();
  }
  setVariation (variation) {
    this.config.variation = variation;
    return this
  }
  getVaration () {
    return this.config.variation;
  }
  chooseFrom (...args) {
    return chooseFrom(...args)
  }
  hashed (...args) {
    return hashed(...args)
  }
  info () {
    return this.config
  }
  telemetry (data) {
    log.log("telemetry", data)
  }
  markTelemetry (which) {
    log.log('marking', this.config.name, this.variation)
  }
  unmarkTelemetry (which) {
    log.log('unmarking', this.config.name, this.variation)
  }
};

var shieldUtils = new Shield ();
