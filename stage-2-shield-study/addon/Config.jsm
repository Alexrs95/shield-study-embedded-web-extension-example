"use strict";

/* to use:

- this file has chrome privileges
- Cu.import will work for any 'general firefox things' (Services,etc)
  but NOT for addon-specific libs
*/

var EXPORTED_SYMBOLS = ["config"];

var slug = 'shield-example-addon'; // matches chrome.manifest;

var config = {
  "shield": {
    "days": 1,
    "name": "an experiment",
    "variation": "kittens", // optional, use to override/decide
    "variations": [
      {"name": "kittens",
       "weight": 1},
      {"name": "puppers",
       "weight": 1}
    ],
    // urls to open after different events.  Usually surveys or orientation pages
    "urls": {
      "ineligible": "http://www.example.com/?reason=ineligible",
      "expired": "http://www.example.com/?reason=expired"
    },
    "isEligible": async function () {
      return false;
    }
  },
  // modules to load/unload
  "modules": [
    `resource://${slug}/lib/ShieldStudy.jsm`
  ]
};
