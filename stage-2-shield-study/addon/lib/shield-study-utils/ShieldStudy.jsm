"use strict";

const {utils: Cu} = Components;

Cu.import("resource://gre/modules/Log.jsm");
const log = Log.repository.getLogger("shield-study-utils");
log.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()));
log.level = Log.Level.Debug;

Cu.importGlobalProperties(['URL', 'crypto']);
const EXPORTED_SYMBOLS = ["studyUtils"];

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

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

const DIRECTORY = new URL(this.__URI__ + "/../").href;
XPCOMUtils.defineLazyGetter(this, "nodeRequire", () => {
  const {Loader, Require} = Cu.import("resource://gre/modules/commonjs/toolkit/loader.js", {});
  const loader = new Loader({
    paths: {
      "": DIRECTORY
    }
  });
  return new Require(loader, {});
});

XPCOMUtils.defineLazyGetter(this, "ajv", () => {
  const Ajv = nodeRequire("ajv.min.js");
  return new Ajv();
});

// I don't LOVE this interface
var jsonschema = {
  validate: function (data, schema) {
    var valid = ajv.validate(schema, data);
    return {valid: valid, errors:  ajv.errors || []};
  }
};

const schemas = {
  'shield-study': nodeRequire('schemas-client/shield-study.schema.json'),
  'shield-study-addon': nodeRequire('schemas-client/shield-study-addon.schema.json'),
  'shield-study-error': nodeRequire('schemas-client/shield-study-error.schema.json'),
  'sampleWeights': {
  }
};

// create a validate function
function validate (data, schema) {
  return {valid: true, errors: null}
}

// survey utils
function survey (url, queryArgs={}) {
  if (! url) return;

  let U = new URL(url);
  let q = U.search || '?';
  q = new URLSearchParams(q);

  // get user info.
  Object.keys(queryArgs).forEach((k)=>{
    q.set(k, queryArgs[k]);
  });

  let searchstring = q.toString();
  U.search = searchstring;
  return U.toString();
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
    this.config = {};
    this.addonData = {};

    // es6-ish way of binding up `this`.
    this.handleWebExtensionMessage = async function ({shield,msg,data}, sender, sendResponse) {
      // shield: boolean, if present, request is for shield
      if (!shield) return;
      let allowedMethods= ['endStudy', 'telemetry', 'info'];
      if (! allowedMethods.includes(msg)) return;
      sendResponse(this[msg](data));
    }
  }
  configure (config, addonData) {
    this.config = config;
    this.addonData = addonData;
    return this
  }
  async openTab (url, params={}) {
    log.debug("opening this formatted tab", url, params);
    Services.wm.getMostRecentWindow("navigator:browser").gBrowser.addTab(url, params)

  }
  async end ({reason}) {
    log.debug('dying!', reason)
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
    log.debug("telemetry", data)
  }
  setActive (which) {
    log.debug('marking', this.config.name, this.variation)
    TelemetryEnvironment.setExperimentActive(this.config.name, this.variation);
  }
  unsetActive (which) {
    log.debug('unmarking', this.config.name, this.variation);
    TelemetryEnvironment.setExperimentInactive(this.config.name);
  }
  setAddonId(id) {
    this._addonId = id;
  }
  surveyUrl(urlTemplate) {
    log.debug(`survey: ${urlTemplate} filled with args`);
  }

  uninstall (id) {
    if (!id) id = this.addonData.id;
    log.debug(`about to uninstall ${id}`)
    AddonManager.getAddonByID(id, addon=>addon.uninstall());
  }
  ping (...args) {
    // grossly titled, but sends study pings
    log.debug('ping', ...args);
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
};

var studyUtils = new StudyUtils();
