//@ts-check

import { assert } from "./assert.js";
import { BinaryReader } from "./binaryReader.js";
import { readCoordsFactory } from "./readCoords.js";

export class TrueTypeFont {

    constructor(arrayBuffer) {
        this.file = new BinaryReader(arrayBuffer);
        this.tables = this.readOffsetTables(this.file);
        this.readHeadTable(this.file);
        this.length = this.glyphCount();
    }

    readOffsetTables(file) {
        const tables = {};
        this.scalarType = file.getUint32();
        const numTables = file.getUint16();
        this.searchRange = file.getUint16();
        this.entrySelector = file.getUint16();
        this.rangeShift = file.getUint16();

        for (let i = 0; i < numTables; i++) {
            const tag = file.getString(4);
            tables[tag] = {
                checksum: file.getUint32(),
                offset: file.getUint32(),
                length: file.getUint32()
            };

            if (tag !== 'head') {
                assert(this.calculateTableChecksum(file, tables[tag].offset,
                    tables[tag].length) === tables[tag].checksum);
            }
        }

        return tables;
    }

    calculateTableChecksum(file, offset, length) {
        const old = file.seek(offset);
        let sum = 0;
        let nlongs = ((length + 3) / 4) | 0;
        while (nlongs--) {
            sum = (sum + file.getUint32() & 0xffffffff) >>> 0;
        }

        file.seek(old);
        return sum;
    }

    readHeadTable(file) {
        assert("head" in this.tables);
        file.seek(this.tables["head"].offset);

        this.version = file.getFixed();
        this.fontRevision = file.getFixed();
        this.checksumAdjustment = file.getUint32();
        this.magicNumber = file.getUint32();
        assert(this.magicNumber === 0x5f0f3cf5);
        this.flags = file.getUint16();
        this.unitsPerEm = file.getUint16();
        this.created = file.getDate();
        this.modified = file.getDate();
        this.xMin = file.getFword();
        this.yMin = file.getFword();
        this.xMax = file.getFword();
        this.yMax = file.getFword();
        this.macStyle = file.getUint16();
        this.lowestRecPPEM = file.getUint16();
        this.fontDirectionHint = file.getInt16();
        this.indexToLocFormat = file.getInt16();
        this.glyphDataFormat = file.getInt16();
    }

    glyphCount() {
        assert("maxp" in this.tables);
        const old = this.file.seek(this.tables["maxp"].offset + 4);
        const count = this.file.getUint16();
        this.file.seek(old);
        return count;
    }

    getGlyphOffset(index) {
        assert("loca" in this.tables);
        const table = this.tables["loca"];
        const file = this.file;
        let offset;
        let old;

        if (this.indexToLocFormat === 1) {
            old = file.seek(table.offset + index * 4);
            offset = file.getUint32();
        } else {
            old = file.seek(table.offset + index * 2);
            offset = file.getUint16() * 2;
        }

        file.seek(old);

        return offset + this.tables["glyf"].offset;
    }

    readGlyphs(file) {
        assert("glyf" in this.tables);
        const glyphTable = this.tables["glyf"];

        file.seek(glyphTable.offset);

        const glyphs = [];

        while (file.tell() < glyphTable.offset + glyphTable.length) {
            glyphs.push(this.readGlyph(file));

            while (file.tell() & 1) {
                file.getUint8();
            }
        }

        return glyphs;
    }

    readGlyph(index) {
        const offset = this.getGlyphOffset(index);
        const file = this.file;

        if (offset >= this.tables["glyf"].offset + this.tables["glyf"].length) {
            return null;
        }

        assert(offset >= this.tables["glyf"].offset);
        assert(offset < this.tables["glyf"].offset + this.tables["glyf"].length);

        file.seek(offset);

        const glyph = {
            numberOfContours: file.getInt16(),
            xMin: file.getFword(),
            yMin: file.getFword(),
            xMax: file.getFword(),
            yMax: file.getFword()
        };

        assert(glyph.numberOfContours >= -1);

        if (glyph.numberOfContours === -1) {
            this.readCompoundGlyph(file, glyph);
        } else {
            this.readSimpleGlyph(file, glyph);
        }

        return glyph;
    }

    readSimpleGlyph(file, glyph) {

        const ON_CURVE = 1;
        const X_IS_BYTE = 2;
        const Y_IS_BYTE = 4;
        const REPEAT = 8;
        const X_DELTA = 16;
        const Y_DELTA = 32;

        const points = glyph.points = [];

        glyph.type = "simple";
        glyph.contourEnds = [];

        for (let i = 0; i < glyph.numberOfContours; i++) {
            glyph.contourEnds.push(file.getUint16());
        }

        // skip over intructions
        file.seek(file.getUint16() + file.tell());

        if (glyph.numberOfContours === 0) {
            return;
        }

        const numPoints = Math.max.apply(null, glyph.contourEnds) + 1;
        const flags = [];
        const readCoords = readCoordsFactory(numPoints, file, flags, points);


        for (let i = 0; i < numPoints; i++) {
            const flag = file.getUint8();
            flags.push(flag);
            points.push({
                onCurve: (flag & ON_CURVE) > 0
            });

            if (flag & REPEAT) {
                let repeatCount = file.getUint8();
                assert(repeatCount > 0);
                i += repeatCount;
                while (repeatCount--) {
                    flags.push(flag);
                    points.push({
                        onCurve: (flag & ON_CURVE) > 0
                    });
                }
            }
        }

        readCoords("x", X_IS_BYTE, X_DELTA, glyph.xMin, glyph.xMax);
        readCoords("y", Y_IS_BYTE, Y_DELTA, glyph.yMin, glyph.yMax);
    }

    readCompoundGlyph(file, glyph) {
        const ARG_1_AND_2_ARE_WORDS = 1,
            ARGS_ARE_XY_VALUES = 2,
            ROUND_XY_TO_GRID = 4,
            WE_HAVE_A_SCALE = 8,
            // RESERVED              = 16
            MORE_COMPONENTS = 32,
            WE_HAVE_AN_X_AND_Y_SCALE = 64,
            WE_HAVE_A_TWO_BY_TWO = 128,
            WE_HAVE_INSTRUCTIONS = 256,
            USE_MY_METRICS = 512,
            OVERLAP_COMPONENT = 1024;

        glyph.type = "compound";
        glyph.components = [];

        let flags = MORE_COMPONENTS;
        while (flags & MORE_COMPONENTS) {
            let arg1;
            let arg2;

            flags = file.getUint16();
            const component = {
                glyphIndex: file.getUint16(),
                matrix: {
                    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0
                }
            };

            if (flags & ARG_1_AND_2_ARE_WORDS) {
                arg1 = file.getInt16();
                arg2 = file.getInt16();
            } else {
                arg1 = file.getUint8();
                arg2 = file.getUint8();
            }

            if (flags & ARGS_ARE_XY_VALUES) {
                component.matrix.e = arg1;
                component.matrix.f = arg2;
            } else {
                component.destPointIndex = arg1;
                component.srcPointIndex = arg2;
            }

            if (flags & WE_HAVE_A_SCALE) {
                component.matrix.a = file.get2Dot14();
                component.matrix.d = component.matrix.a;
            } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
                component.matrix.a = file.get2Dot14();
                component.matrix.d = file.get2Dot14();
            } else if (flags & WE_HAVE_A_TWO_BY_TWO) {
                component.matrix.a = file.get2Dot14();
                component.matrix.b = file.get2Dot14();
                component.matrix.c = file.get2Dot14();
                component.matrix.d = file.get2Dot14();
            }

            glyph.components.push(component);
        }

        if (flags & WE_HAVE_INSTRUCTIONS) {
            file.seek(file.getUint16() + file.tell());
        }
    }

    drawGlyph(index, ctx) {

        const glyph = this.readGlyph(index);

        if (glyph === null || glyph.type !== "simple") {
            return false;
        }

        let contourEnd = 0;
        let isFirst = true;
        let firstPoint = null;


        for (let i = 0; i < glyph.points.length; i++) {
            const point = glyph.points[i];

            if (isFirst) {
                ctx.moveTo(point.x, point.y);
                firstPoint = point;
                isFirst = false;
            } else {
                ctx.lineTo(point.x, point.y);
            }

            if (i === glyph.contourEnds[contourEnd]) {
                contourEnd++;
                isFirst = true;

                if (firstPoint !== null) {
                    ctx.lineTo(firstPoint.x, firstPoint.y);
                }
            }
        }

        return true;
    }

}