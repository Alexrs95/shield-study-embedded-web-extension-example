"use strict";

const {utils: Cu} = Components;

Cu.import("resource://gre/modules/Log.jsm");
const log = Log.repository.getLogger("shield-study-utils");
log.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()));
log.level = Log.Level.Debug;

const UTILS_VERSION = 4; //TODO glind require('../package.json').version;
const PACKET_VERSION = 3;

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
  const loader = new Loader({});
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
  'shield-study': nodeRequire(DIRECTORY + 'schemas-client/shield-study.schema.json'),
  'shield-study-addon': nodeRequire(DIRECTORY + 'schemas-client/shield-study-addon.schema.json'),
  'shield-study-error': nodeRequire(DIRECTORY + 'schemas-client/shield-study-error.schema.json'),
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
  firstSeen () {
    log.debug("firstSeen: ${date.now()}");
    this._telemetry({study_state: 'enter'}, 'shield-study');
  }
  setActive (which) {
    log.debug('marking', this.config.name, this.variation)
    TelemetryEnvironment.setExperimentActive(this.config.name, this.variation);
  }
  unsetActive (which) {
    log.debug('unmarking', this.config.name, this.variation);
    TelemetryEnvironment.setExperimentInactive(this.config.name);
  }
  surveyUrl(urlTemplate) {
    log.debug(`survey: ${urlTemplate} filled with args`);
  }
  uninstall (id) {
    if (!id) id = this.addonData.id;
    log.debug(`about to uninstall ${id}`)
    AddonManager.getAddonByID(id, addon=>addon.uninstall());
  }
  // watchExpire()??? timer?  expireAfter?
  // pingDaily()
  async magicChooseVariation () {
    log.debug(`magicChooseVariation`)
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
  async magicStartup(reason) {
    log.debug(`magicStartup ${reason}`);
    if (reason === REASONS.ADDON_INSTALL) {
      this._telemetry({study_state: 'installed'}, 'shield-study');
    }
  }
  async magicShutdown(reason) {
    log.debug(`magicShutdown ${reason}`);
  }
  async endStudy({reason, fullname}) {
    log.debug(`wants to end study ${reason}`);
    // TODO glind, think about reason vs fullname
    // TODO glind, think about race conditions for endings, ensure only one exit
    this.config.urls[reason] && this.openTab(this.config.urls[reason]);
    switch (reason) {
      case "ineligible":
      case "expired":
      case "user-disable":
      case "ended-positive":
      case "ended-neutral":
      case "ended-negative":
        this._telemetry({study_state: reason, fullname: fullname});
        break;
      default:
        this._telemetry({study_state: "ended-neutral", study_state_fullname: reason});
        // unless we know better TODO grl
    }
    // these are all exits
    this._telemetry({study_state: 'exit'}, 'shield-study');
    this.uninstall();  // TODO glind. should be controllable by arg?
  }

  get surveyQueryArgs () {
    let queryArgs = {
      shield: PACKET_VERSION,
      study: this.config.name,
      variation: this.variation,
      updateChannel: Services.appinfo.defaultUpdateChannel,
      fxVersion: Services.appinfo.version,
      addon: self.version, // addon version
      who: userId() // telemetry clientId
    };
    if (prefSvc.get('shield.testing')) queryArgs.testing = 1;
    return queryArgs;
  }

  showSurvey(reason) {
    // should there be an appendArgs boolean?
    let partial = this.config.urls[reason];

    let queryArgs = this.surveyQueryArgs;

    queryArgs.reason = reason;
    if (partial) {
      let url = survey(partial, queryArgs);
      //emit(SurveyWatcher, 'survey', [reason, url]);
      this.openTab(url);
      return url;
    } else {
      //emit(SurveyWatcher, 'survey', [reason, null]);
      return;
    }
  }
  _telemetry(data, bucket='shield-study-addon') {
    let payload = {
      version:        PACKET_VERSION,
      study_name:     this.config.name,
      branch:         this.variation,
      //addon_version:  self.version,
      shield_version: UTILS_VERSION,
      type:           bucket,
      data:           data
    };
    //if (prefSvc.get('shield.testing')) payload.testing = true;
    payload.testing = this.config.testing;

    let validation;

    /* istanbul ignore next */
    try {
      validation = jsonschema.validate(payload, schemas[bucket]);
    } catch (err) {
      // if validation broke, GIVE UP.
      log.error(err);
      return;
    }

    if (validation.errors.length) {
      let errorReport = {
        'error_id': 'jsonschema-validation',
        'error_source': 'addon',
        'severity': 'fatal',
        'message': JSON.stringify(validation.errors)
      };
      if (bucket === 'shield-study-error') {
        // log: if it's a warn or error, it breaks jpm test
        Console.log('cannot validate shield-study-error', data, bucket);
        return; // just die, maybe should have a super escape hatch?
      }
      return this.telemetryError(errorReport);
    }
    //emit(TelemetryWatcher, 'telemetry', [bucket, payload]);
    let telOptions = {addClientId: true, addEnvironment: true};
    return TelemetryController.submitExternalPing(bucket, payload, telOptions);
  }

  // telemetry from addon
  telemetry (data) {
    log.debug(`telemetry ${data}`);
    let toSubmit = {
      attributes: data
    };
    this._telemetry(toSubmit, 'shield-study-addon');
  }

  telemetryError (errorReport) {
    return this._telemetry(errorReport, 'shield-study-error');
  }
};

var studyUtils = new StudyUtils();
