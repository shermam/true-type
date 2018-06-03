//@ts-check

import { TrueTypeFont } from "./trueTypeFont.js";

export function ShowTtfFile(arrayBuffer) {
    var font = new TrueTypeFont(arrayBuffer);

    var width = font.xMax - font.xMin;
    var height = font.yMax - font.yMin;
    var scale = 64 / font.unitsPerEm;

    var container = document.getElementById("font-container");

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    for (var i = 0; i < font.length; i++) {
        var canvas = document.createElement("canvas");
        canvas.style.border = "1px solid gray";
        canvas.width = width * scale;
        canvas.height = height * scale;
        var ctx = canvas.getContext("2d");
        ctx.scale(scale, -scale);
        ctx.translate(-font.xMin, -font.yMin - height);
        ctx.fillStyle = "#FFFF00";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 30;
        ctx.beginPath();
        if (font.drawGlyph(i, ctx)) {
            ctx.stroke();
            ctx.fill();
            container.appendChild(canvas);
        }
    }
}