//@ts-check
//Code from http://stevehanov.ca/blog/index.php?id=143

import { ShowTtfFile } from "./showTtfFile.js";

fetch('Arial.ttf')
    .then(r => r.arrayBuffer())
    .then(ShowTtfFile);