//@ts-check

import { TrueTypeFont } from "./trueTypeFont.js";

export function ShowTtfFile(arrayBuffer) {
    const font = new TrueTypeFont(arrayBuffer);
    const width = font.xMax - font.xMin;
    const height = font.yMax - font.yMin;
    const scale = 256 / font.unitsPerEm;
    const container = document.getElementById("font-container");

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    for (let i = 0; i < font.length; i++) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.style.border = "1px solid gray";
        canvas.width = width * scale;
        canvas.height = height * scale;
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