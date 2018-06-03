//@ts-check

export function assert(condition, message) {
    message = message || "Assertion failed";
    if (!condition) {
        alert(message);
        throw message;
    }
}