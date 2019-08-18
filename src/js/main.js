//@ts-check
//Code from http://stevehanov.ca/blog/index.php?id=143

//ref: https://developer.apple.com/fonts/TrueType-Reference-Manual/RM01/Chap1.html

import { ShowTtfFile } from "./showTtfFile.js";

fetch("comic.ttf")
  .then(r => r.arrayBuffer())
  .then(ShowTtfFile);
