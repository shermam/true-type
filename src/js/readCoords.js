export function readCoordsFactory(numPoints, file, flags, points) {
    return (name, byteFlag, deltaFlag, min, max) => {
        let value = 0;

        for (let i = 0; i < numPoints; i++) {
            const flag = flags[i];
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
}