// import jsdom from "global-jsdom";
// jsdom();

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><body></body>");
Object.assign(globalThis, {
    document: dom.window.document,
    window: dom.window,
    HTMLIFrameElement: dom.window.HTMLIFrameElement,
});
