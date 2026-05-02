#!/usr/bin/env node
/**
 * Convierte /tmp/gina-logo.svg a public/logo-gina-brows.png 640x640.
 */
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("/tmp/gina-logo.svg", "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 640 },
  background: "#fcf8ed",
});
const png = resvg.render().asPng();
writeFileSync("public/logo-gina-brows.png", png);
console.log(`✓ public/logo-gina-brows.png (${png.length} bytes)`);
