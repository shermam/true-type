//@ts-check
import { assert } from "./assert.js";

export class BinaryReader {

    constructor(arrayBuffer) {
        assert(arrayBuffer instanceof ArrayBuffer);
        this.pos = 0;
        this.data = new Uint8Array(arrayBuffer);
    }

    seek(pos) {
        assert(pos >= 0 && pos <= this.data.length);
        const oldPos = this.pos;
        this.pos = pos;
        return oldPos;
    }

    tell() {
        return this.pos;
    }

    getUint8() {
        assert(this.pos < this.data.length);
        return this.data[this.pos++];
    }

    getUint16() {
        return ((this.getUint8() << 8) | this.getUint8()) >>> 0;
    }

    getUint32() {
        return this.getInt32() >>> 0;
    }

    getInt16() {
        let result = this.getUint16();
        if (result & 0x8000) {
            result -= (1 << 16);
        }
        return result;
    }

    getInt32() {
        return ((this.getUint8() << 24) |
            (this.getUint8() << 16) |
            (this.getUint8() << 8) |
            (this.getUint8()));
    }

    getFword() {
        return this.getInt16();
    }

    get2Dot14() {
        return this.getInt16() / (1 << 14);
    }

    getFixed() {
        return this.getInt32() / (1 << 16);
    }

    getString(length) {
        let result = "";
        for (let i = 0; i < length; i++) {
            result += String.fromCharCode(this.getUint8());
        }
        return result;
    }

    getDate() {
        const macTime = this.getUint32() * 0x100000000 + this.getUint32();
        const utcTime = macTime * 1000 + Date.UTC(1904, 1, 1);
        return new Date(utcTime);
    }
}