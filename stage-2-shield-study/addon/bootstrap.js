"use strict";

// __SCRIPT_URI_SPEC__ <- bootstrap.js
const {utils: Cu} = Components;

const CONFIGPATH = `${__SCRIPT_URI_SPEC__}/../Config.jsm`;
let config = Cu.import(CONFIGPATH, {}).config; // leak to module

// logging
Cu.import("resource://gre/modules/Log.jsm");
const log = Log.repository.getLogger(config.shield.name);
log.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()));
log.level = config.log.level || Log.Level.Debug; // should be a config / pref

let variation;

this.startup = async function(data, reason) {
  // Array [ "id", "version", "installPath", "resourceURI", "instanceID", "webExtension" ]  bootstrap.js:48
  log.debug('startup', REASONS[reason] || reason);
  let {webExtension} = data;
  Jsm.import(config.modules);

  // config has branches, sampling, urls, addonData with id
  studyUtils.configure(config.shield, data);

  switch (REASONS[reason]) {
    case 'ADDON_INSTALL': {
      let eligible = await config.isEligible(); // addon-specific
      if (!eligible) {
        // opens config.urls.ineligible if any, then uninstalls
        await studyUtils.endStudy({reason:'ineligible'});
        return
      }
      await studyUtils.magicStartup(reason);
      break;
    }
    case 'APP_STARTUP': {
      await studyUtils.magicStartup(reason);
      break;
    }
    default:
      log.debug("got this!  wut?", REASONS[reason]);
      break;
  }

  // if you have code to handle expiration / long-timers, it goes here.

  webExtension.startup().then(api => {
    const {browser} = api;
    // messages intended for shield:  {shield:true,msg=[endStudy|telemetry],data=data}
    browser.runtime.onMessage.addListener((...args) => studyUtils.handleWebExtensionMessage(...args));
    // register other handlers from your addon, if any

  });
};

this.shutdown = async function(data, reason) {
  log.debug('shutdown', REASONS[reason] || reason);
  studyUtils.magicShutdown(reason);
  // unloads must come after module work
  Jsm.unload([CONFIGPATH]);
  Jsm.unload(config.modules);
};

this.uninstall = async function (data, reason) {
  log.debug('uninstall', REASONS[reason] || reason);
};

this.install = async function (data, reason) {
  log.debug('install', REASONS[reason] || reason);   // handle ADDON_UPGRADE if needful
};


/* CONSTANTS and other stuff */

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

// jsm loader / unloader
class Jsm {
  static import (modulesArray) {
    for (let module of modulesArray) {
      log.debug(`loading ${module}`);
      Cu.import(module);
    }
  }
  static unload (modulesArray) {
    for (let module of modulesArray) {
      log.debug(`Unloading ${module}`);
      Cu.unload(module);
    }
  }
}

