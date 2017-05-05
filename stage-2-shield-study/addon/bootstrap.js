"use strict";

// __SCRIPT_URI_SPEC__ <- bootstrap.js
const {utils: Cu} = Components;

Cu.import("resource://gre/modules/Log.jsm");
const log = Log.repository.getLogger("shield-example");
log.level = Log.Level.Debug; // TODO @gregglind make this config
log.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()));

let config, variation, addon;

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

this.install = async function ({webExtension}, reason) {
  log.debug('install', REASONS[reason]);
};

this.startup = async function(data, reason) {
  // Start the embedded webextension.
  // Array [ "id", "version", "installPath", "resourceURI", "instanceID", "webExtension" ]  bootstrap.js:48
  let {webExtension} = data;
  log.debug('startup', REASONS[reason]);
  config = Cu.import(`${data.resourceURI.spec}/lib/Config.jsm`, {}).config; // leak to module
  Jsm.import(config.modules);
  shieldUtils.configure(config.shield);

  switch (REASONS[reason]) {
    case 'ADDON_INSTALL': {
      // only here check eligible, if any
      let eligible = true;
      if (!eligible) {
        shieldUtils.openTab(config.shield.urls.ineligible);
        shieldUtils.die('ineligible'); // sends telemetry
      }
      // no break! go on to startup!
    }
    default: {
      let clientId = await shieldUtils.getTelemetryId();
      let rng = await shieldUtils.hashed(config.shield.name, clientId);
      variation = shieldUtils.setVariation(
        config.shield.variation ||
          shieldUtils.chooseFrom(
            config.shield.variations,
            rng=rng
          )
        );
      break;
    }
  }

  webExtension.startup().then(api => {
    log.debug("we started up!");
    const {browser} = api;
    browser.runtime.onMessage.addListener(({shield,msg,data}, sender, sendResponse) => {
      log.debug("message", msg);
      if (shield) sendResponse(shieldUtils[msg](data))
    });
  });
};

this.shutdown = async function(data, reason) {
  log.debug('shutdown', REASONS[reason]);
  //shieldUtils.shutdown(data, reason);
  Cu.unload(`${data.resourceURI.spec}/lib/Config.jsm`);
  Jsm.unload(config.modules);
};

this.uninstall = async function (reason) {
  log.debug('uninstall', REASONS[reason]);
  //shieldUtils.uninstall(reason);
};
