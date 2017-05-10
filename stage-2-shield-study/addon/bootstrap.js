"use strict";

// __SCRIPT_URI_SPEC__ <- bootstrap.js
const {utils: Cu} = Components;

const CONFIGPATH = `${__SCRIPT_URI_SPEC__}/../Config.jsm`;
let config = Cu.import(CONFIGPATH, {}).config; // leak to module

Cu.import("resource://gre/modules/Log.jsm");
const log = Log.repository.getLogger(config.shield.name);
log.level = Log.Level.Debug; // should be a config
log.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()));

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

class Jsm {
  static import (modulesArray) {
    for (const module of modulesArray) {
      log.debug(`loading ${module}`);
      Cu.import(module);
    }
  }
  static unload (modulesArray) {
    for (const module of modulesArray) {
      log.debug(`Unloading ${module}`);
      Cu.unload(module);
    }
  }
}

let variation;


this.install = async function ({webExtension}, reason) {
  log.debug('install', REASONS[reason]);
};

this.startup = async function(data, reason) {
  // Start the embedded webextension.
  // Array [ "id", "version", "installPath", "resourceURI", "instanceID", "webExtension" ]  bootstrap.js:48
  let {webExtension} = data;
  log.debug('startup', REASONS[reason]);
  Jsm.import(config.modules);
  shieldUtils.configure(config.shield);
  shieldUtils.setAddonId(data.id); // GRL UGH, wtf!

  switch (REASONS[reason]) {
    case 'ADDON_INSTALL': {
      let eligible = await config.shield.isEligible();
      if (!eligible) {
        await shieldUtils.standardIneligible();
        return
      }
      shieldUtils.ping('install');
      // no break! fall through to startup!
    }
    case 'APP_STARTUP': {
      await shieldUtils.standardStartup()
      break;
    }
    default:
      log.debug("got this!  wut?", REASONS[reason]);
      break;
  }

  webExtension.startup().then(api => {
    const {browser} = api;

    // listen for any messages intended for shield
    browser.runtime.onMessage.addListener(({shield,msg,data}, sender, sendResponse) => {
      if (!shield) return;
      let allowed = ['end', 'telemetry', 'info'];
      if (! allowed.includes(msg)) return;
      sendResponse(shieldUtils[msg](data))
    });

    // register other handlers from your addon
  });
};

this.shutdown = async function(data, reason) {
  log.debug('shutdown', REASONS[reason] || reason);
  Cu.unload(CONFIGPATH);
  Jsm.unload(config.modules);
};

this.uninstall = async function (reason) {
  log.debug('uninstall', REASONS[reason] || reason);
  //shieldUtils.uninstall(reason);
};
