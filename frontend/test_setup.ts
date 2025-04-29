import { JSDOM } from "npm:jsdom@24.0.0";

const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    url: "http://localhost",
    pretendToBeVisual: true,
});

// Configure global DOM environment
Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    customElements: dom.window.customElements,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
}); 