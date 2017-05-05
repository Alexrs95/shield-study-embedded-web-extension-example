"use strict";

var EXPORTED_SYMBOLS = ["config"];

var slug = 'shield-example-addon';
var config = {
  "shield": {
    "days": 1,
    "name": "an experiment",
    "variation": "kittens",
    "variations": [
      {"name": "kittens",
       "weight": 1},
      {"name": "puppers",
       "weight": 1}
    ],
    "urls": {
      "ineligible": "some/url",
      "expired": "some/other/url"
    }
  },
  "modules": [
    `resource://${slug}/lib/ShieldStudy.jsm`
  ]
};
