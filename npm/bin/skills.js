#!/usr/bin/env node

// Forward `skills <args>` directly to LiteSPM's skills engine
process.argv.splice(2, 0, "skills");
require("./litespm.js").main();
