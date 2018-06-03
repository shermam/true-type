//@ts-check

import { assert } from "./assert.js";
import { BinaryReader } from "./binaryReader.js";

export class TrueTypeFont {

    constructor(arrayBuffer) {
        this.file = new BinaryReader(arrayBuffer);
        this.tables = this.readOffsetTables(this.file);
        this.readHeadTable(this.file);
        this.length = this.glyphCount();
    }

    readOffsetTables(file) {
        var tables = {};
        this.scalarType = file.getUint32();
        var numTables = file.getUint16();
        this.searchRange = file.getUint16();
        this.entrySelector = file.getUint16();
        this.rangeShift = file.getUint16();

        for (var i = 0; i < numTables; i++) {
            var tag = file.getString(4);
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
        var old = file.seek(offset);
        var sum = 0;
        var nlongs = ((length + 3) / 4) | 0;
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
        var old = this.file.seek(this.tables["maxp"].offset + 4);
        var count = this.file.getUint16();
        this.file.seek(old);
        return count;
    }

    getGlyphOffset(index) {
        assert("loca" in this.tables);
        var table = this.tables["loca"];
        var file = this.file;
        var offset, old;

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
        var glyphTable = this.tables["glyf"];

        file.seek(glyphTable.offset);

        var glyphs = [];

        while (file.tell() < glyphTable.offset + glyphTable.length) {
            glyphs.push(this.readGlyph(file));

            while (file.tell() & 1) {
                file.getUint8();
            }
        }

        return glyphs;
    }

    readGlyph(index) {
        var offset = this.getGlyphOffset(index);
        var file = this.file;

        if (offset >= this.tables["glyf"].offset + this.tables["glyf"].length) {
            return null;
        }

        assert(offset >= this.tables["glyf"].offset);
        assert(offset < this.tables["glyf"].offset + this.tables["glyf"].length);

        file.seek(offset);

        var glyph = {
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

        var ON_CURVE = 1,
            X_IS_BYTE = 2,
            Y_IS_BYTE = 4,
            REPEAT = 8,
            X_DELTA = 16,
            Y_DELTA = 32;

        glyph.type = "simple";
        glyph.contourEnds = [];
        var points = glyph.points = [];

        for (var i = 0; i < glyph.numberOfContours; i++) {
            glyph.contourEnds.push(file.getUint16());
        }

        // skip over intructions
        file.seek(file.getUint16() + file.tell());

        if (glyph.numberOfContours === 0) {
            return;
        }

        var numPoints = Math.max.apply(null, glyph.contourEnds) + 1;

        var flags = [];

        for (i = 0; i < numPoints; i++) {
            var flag = file.getUint8();
            flags.push(flag);
            points.push({
                onCurve: (flag & ON_CURVE) > 0
            });

            if (flag & REPEAT) {
                var repeatCount = file.getUint8();
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

        function readCoords(name, byteFlag, deltaFlag, min, max) {
            var value = 0;

            for (var i = 0; i < numPoints; i++) {
                var flag = flags[i];
                if (flag & byteFlag) {
                    if (flag & deltaFlag) {
                        value += file.getUint8();
                    } else {
                        value -= file.getUint8();
                    }
                } else if (~flag & deltaFlag) {
                    value += file.getInt16();
                } else {
                    // value is unchanged.
                }

                points[i][name] = value;
            }
        }

        readCoords("x", X_IS_BYTE, X_DELTA, glyph.xMin, glyph.xMax);
        readCoords("y", Y_IS_BYTE, Y_DELTA, glyph.yMin, glyph.yMax);
    }

    readCompoundGlyph(file, glyph) {
        var ARG_1_AND_2_ARE_WORDS = 1,
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

        var flags = MORE_COMPONENTS;
        while (flags & MORE_COMPONENTS) {
            var arg1, arg2;

            flags = file.getUint16();
            var component = {
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

        var glyph = this.readGlyph(index);

        if (glyph === null || glyph.type !== "simple") {
            return false;
        }

        var p = 0,
            c = 0,
            first = 1;

        while (p < glyph.points.length) {
            var point = glyph.points[p];
            if (first === 1) {
                ctx.moveTo(point.x, point.y);
                first = 0;
            } else {
                ctx.lineTo(point.x, point.y);
            }

            if (p === glyph.contourEnds[c]) {
                c += 1;
                first = 1;
            }

            p += 1;
        }

        return true;
    }

}




