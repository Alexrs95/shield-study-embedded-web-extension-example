"use strict";

/* global  __SCRIPT_URI_SPEC__  */
const {utils: Cu} = Components;
const CONFIGPATH = `${__SCRIPT_URI_SPEC__}/../Config.jsm`;
const { config } = Cu.import(CONFIGPATH, {});
const { studyUtils } = Cu.import(config.sheid.installPath, {});

const log = createLog(config.shield.name, config.log.level);  // defined below.

this.startup = async function(addonData, reason) {
  // addonData: Array [ "id", "version", "installPath", "resourceURI", "instanceID", "webExtension" ]  bootstrap.js:48
  log.debug("startup", REASONS[reason] || reason);
  Jsm.import(config.modules);

  // Configure name, urls, addonData with id
  studyUtils.configure(config.shield, addonData);

  switch (REASONS[reason]) {
    case "ADDON_INSTALL": {
      studyUtils.saveFirstSeen(Date.now()); // TODO, store a time
      const eligible = await config.isEligible(); // addon-specific
      if (!eligible) {
        // opens config.urls.ineligible if any, then uninstalls
        await studyUtils.endStudy({reason: "ineligible"});
        return;
      }
    }
  }
  // deterministic sampling, set variation
  const variation = await chooseVariation();
  await studyUtils.setVariation(variation);
  await studyUtils.startup(reason);

  // if you have code to handle expiration / long-timers, it goes here.

  const {webExtension} = addonData;
  webExtension.startup().then(api => {
    const {browser} = api;
    // messages intended for shield:  {shield:true,msg=[endStudy|telemetry],data=data}
    browser.runtime.onMessage.addListener(studyUtils.respondToWebExtensionMessage);
    //  other message handlers from your addon, if any
  });
};

this.shutdown = async function(addonData, reason) {
  log.debug("shutdown", REASONS[reason] || reason);
  studyUtils.magicShutdown(reason);
  // unloads must come after module work
  Jsm.unload([CONFIGPATH]);
  Jsm.unload(config.modules);
  Jsm.unload(config.shield.installPath);
};

this.uninstall = async function(addonData, reason) {
  log.debug("uninstall", REASONS[reason] || reason);
};

this.install = async function(addonData, reason) {
  log.debug("install", REASONS[reason] || reason);   // handle ADDON_UPGRADE if needful
};


/** CONSTANTS and other utilities */

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
for (const r in REASONS) { REASONS[REASONS[r]] = r; }

// logging
function createLog(name, level) {
  Cu.import("resource://gre/modules/Log.jsm");
  Log.repository.getLogger(name);
  log.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()));
  log.level = level || Log.Level.Debug; // should be a config / pref
  return log;
}

async function chooseVariation() {
  let toSet, source;

  if (config.variation) {
    source = "startup-config";
    toSet = config.variation;
  } else {
    source = "weightedVariation";
    // this is the standard arm choosing method
    const clientId = await this.getTelemetryId();
    const hashFraction = await studyUtils.hashFraction(config.name + clientId, 12);
    toSet = studyUtils.chooseFrom(config.shield.variations, hashFraction);
  }
  log.debug(`variation: ${toSet} source:${source}`);
  return toSet;
}

// jsm loader / unloader
class Jsm {
  static import(modulesArray) {
    for (const module of modulesArray) {
      log.debug(`loading ${module}`);
      Cu.import(module);
    }
  }
  static unload(modulesArray) {
    for (const module of modulesArray) {
      log.debug(`Unloading ${module}`);
      Cu.unload(module);
    }
  }
}

