"use strict";

const {utils: Cu} = Components;

Cu.import("resource://gre/modules/Log.jsm");
const log = Log.repository.getLogger("shield-study-utils");
log.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()));
log.level = Log.Level.Debug;



Cu.importGlobalProperties(['URL', 'crypto']);
var EXPORTED_SYMBOLS = ["studyUtils"];

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// addon state change reasons
const REASONS = {
  APP_STARTUP: 1,      // The application is starting up.
  APP_SHUTDOWN: 2,     // The application is shutting down.
  ADDON_ENABLE: 3,     // The add-on is being enabled.
  ADDON_DISABLE: 4,    // The add-on is being disabled. (Also sent during uninstallation)
  ADDON_INSTALL: 5,    // The add-on is being installed.
  ADDON_UNINSTALL: 6,  // The add-on is being uninstalled.
  ADDON_UPGRADE: 7,    // The add-on is being upgraded.
  ADDON_DOWNGRADE: 8,  // The add-on is being downgraded.
};
for (let r in REASONS) { REASONS[REASONS[r]] = r;}

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

// validation utils
// import ajv  // https://dxr.mozilla.org/mozilla-central/source/services/sync/tests/unit/head_helpers.js
// import schemas
let schemas = {
  'shield-config': {},
  'shield-study': {},
  'sheild-study-addon': {},
  'sampleWeights': {
  }
};

// create a validate function
function validate (data, schema) {
  return {valid: true, errors: null}
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
  /*
   weightedVaiations, list of:
   {
    name: string of any length
    weight: float > 0
   }
  */
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

class StudyUtils {
  constructor () {
    this.config = {}
  }
  configure (config, addonData) {
    this.config = config;
    this.addonData = addonData;
    return this
  }
  async openTab (url, params={}) {
    log.log("opening this formatted tab", url, params);
    Services.wm.getMostRecentWindow("navigator:browser").gBrowser.addTab(url, params)

  }
  async end ({reason}) {
    log.log('dying!', reason)
    // send telemetry, do whatever is needful
    this.ping({action:"ended", reason:reason});
    this.uninstall()
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
  setActive (which) {
    log.log('marking', this.config.name, this.variation)
    TelemetryEnvironment.setExperimentActive(this.config.name, this.variation);
  }
  unsetActive (which) {
    log.log('unmarking', this.config.name, this.variation);
    TelemetryEnvironment.setExperimentInactive(this.config.name);
  }
  setAddonId(id) {
    this._addonId = id;
  }
  surveyUrl(urlTemplate) {
    log.log(`survey: ${urlTemplate} filled with args`);
  }

  uninstall (id) {
    if (!id) id = this.addonInfo.id;
    AddonManager.getAddonByID(id, addon=>addon.uninstall());
  }
  ping (...args) {
    // grossly titled, but sends study pings
    log.log('ping', ...args);
  }
  // watchExpire()??? timer?  expireAfter?
  // pingDaily()

  async magicStartup (reason, options = {}) {
    log.debug(`magicStartup ${reason}`)
    let config = this.config;

    // this is the standard arm choosing method
    let clientId = await this.getTelemetryId();
    let rng = await hashed(config.name, clientId);

    let toSet, source;

    if (options.variation) {
      toSet = options.variation;
      source = "function-argument";
    }
    else if (config.variation) {
      toSet = config.variation;
      source = "startup-config";
    }
    else {
      source = 'weightedVariation';
      toSet = this.chooseFrom(
        config.variations,
        rng=rng
      );
    }
    log.debug(`variation: ${toSet} source:${source}`);
    this.setVariation(toSet);
    // set a running timer?
  }

  async magicShutdown(reason) {
    log.debug(`magicShutdown ${reason}`);
  }
  async endStudy({reason}) {
    log.debug(`wants to end study ${reason}`);
    this.config.urls[reason] && this.openTab(this.config.urls[reason]);
    this.ping(reason); // shieldUtils send telemetry install
    this.uninstall();  // should be controllable by arg?
  }
  async handleWebExtensionMessage({shield,msg,data}, sender, sendResponse) {
    // shield: boolean, if present, request is for shield
    if (!shield) return;
    let allowedMethods= ['endStudy', 'telemetry', 'info'];
    if (! allowedMethods.includes(msg)) return;
    sendResponse(this[msg](data));
  }
};

var studyUtils = new StudyUtils ();
