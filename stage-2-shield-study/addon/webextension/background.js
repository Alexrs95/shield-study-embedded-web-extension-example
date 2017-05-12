"use strict";

// template code for talking to shield across `browser.runtime`
async function askShield (msg, data) {
  let allowed = ['endStudy', 'telemetry', 'info'];
  if (!allowed.includes(msg)) throw new Error(`shieldUtils doesn't know ${msg}, only knows ${allowed}`);
  return await browser.runtime.sendMessage({shield: true, msg: msg, data: data});
}
let tellShield = askShield;  // alias


class Feature {
  constructor({variation}) {
    console.log("init", variation);
    this.times = 0;
    // do variations specific work.
    //browser.browserAction.setIcon({path: `icons/${variation}.png`});
    browser.browserAction.setTitle({title: variation});
    browser.browserAction.onClicked.addListener(() => this.handleClick());
  }
  handleClick () {
    this.times += 1;
    console.log('got a click');
    tellShield("telemetry", {"evt": "click", times: this.times});

    // addon-initiated ending
    if (this.times > 5) {
      tellShield("endStudy", {reason: "too-popular"});
    }
  }
}

// initialize the feature, using our specific variation
askShield("info").then(({variation})=> new Feature({variation:variation}))

