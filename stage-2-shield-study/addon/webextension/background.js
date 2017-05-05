"use strict";

// template code for talking to shield across `browser.runtime`
// we can make this thinner by JUST HAVING sendMessage and a doc
class Shield {
  static async info () {
    console.log("module info");
    return browser.runtime.sendMessage({shield: true, msg: 'info'})
  }
  static async telemetry (data) {
    console.log("module telemetry:", data);
    return browser.runtime.sendMessage({shield: true, msg: 'telemetry', data:data});
  }
  static async die (data) {
    // unclear what the args are here.
    console.log("module die:", data);
    return browser.runtime.sendMessage({shield: true, msg: 'die', data:data});
  }
  static async sendMessage(message, ...args) {
    return await browser.runtime.sendMessage({shield: true, msg: message, data: data});
  }
}

class Feature {
  constructor({variation}) {
    console.log("init", variation);
    this.times = 0;
    // do variation specific work.
    //browser.browserAction.setIcon({path: `icons/${variation}.png`});
    browser.browserAction.setTitle({title: variation});
    browser.browserAction.onClicked.addListener(() => this.handleClick());
  }
  handleClick () {
    this.times += 1;
    console.log('got a click');
    Shield.telemetry({"evt": "click", times: this.times});
  }
}

Shield.info().then(({variation})=> new Feature({variation:variation}))

